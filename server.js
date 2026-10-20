const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const {
    S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ======================================================
// CLOUDFLARE R2 CONFIGURATION
// ======================================================

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME =
    process.env.R2_BUCKET_NAME || "watch-together-movies";

const R2_ENDPOINT =
    process.env.R2_ENDPOINT ||
    (R2_ACCOUNT_ID
        ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : null);

if (
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_ACCOUNT_ID ||
    !R2_ENDPOINT
) {
    console.warn("⚠️ R2 environment variables are incomplete.");
}

const r2 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT || undefined,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || "",
        secretAccessKey: R2_SECRET_ACCESS_KEY || ""
    }
});

// ======================================================
// EXPRESS
// ======================================================

app.use(express.json({ limit: "2mb" }));

app.use(express.static("public"));

// ======================================================
// ROOMS
// ======================================================

const rooms = new Map();

// Active multipart uploads
const activeUploads = new Map();

// ======================================================
// ROOM ID
// ======================================================

function createRoomId() {
    return crypto.randomBytes(4).toString("hex");
}

// ======================================================
// CREATE ROOM
// ======================================================

app.get("/create-room", (req, res) => {
    const roomId = createRoomId();

    rooms.set(roomId, {
        hostId: null,
        users: new Map(),

        playing: false,
        currentTime: 0,
        updatedAt: Date.now(),

        movieKey: null,
        movieName: null
    });

    res.redirect(`/room/${roomId}`);
});

// ======================================================
// ROOM PAGE
// ======================================================

app.get("/room/:roomId", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// ======================================================
// CHECK R2
// ======================================================

function checkR2(res) {
    if (
        !R2_ACCESS_KEY_ID ||
        !R2_SECRET_ACCESS_KEY ||
        !R2_ACCOUNT_ID ||
        !R2_BUCKET_NAME
    ) {
        res.status(500).json({
            success: false,
            error: "Cloudflare R2 is not configured correctly."
        });

        return false;
    }

    return true;
}

// ======================================================
// CREATE MULTIPART UPLOAD
// ======================================================

app.post("/upload/initiate", async (req, res) => {
    try {
        if (!checkR2(res)) return;

        const {
            roomId,
            socketId,
            fileName,
            contentType
        } = req.body;

        if (!roomId || !socketId || !fileName) {
            return res.status(400).json({
                success: false,
                error: "Missing upload information."
            });
        }

        const room = rooms.get(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: "Room not found."
            });
        }

        // Only host can upload
        if (socketId !== room.hostId) {
            return res.status(403).json({
                success: false,
                error: "Only the host can upload a movie."
            });
        }

        // Clean filename
        const safeName = String(fileName)
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(0, 200);

        const key =
            `rooms/${roomId}/` +
            `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;

        const command = new CreateMultipartUploadCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType || "application/octet-stream"
        });

        const result = await r2.send(command);

        activeUploads.set(result.UploadId, {
            roomId,
            socketId,
            key,
            fileName: safeName,
            contentType:
                contentType || "application/octet-stream",
            createdAt: Date.now()
        });

        console.log(
            `Started R2 multipart upload: ${safeName}`
        );

        res.json({
            success: true,
            uploadId: result.UploadId,
            key
        });

    } catch (error) {

        console.error("R2 initiate error:", error);

        res.status(500).json({
            success: false,
            error: "Could not start upload."
        });
    }
});

// ======================================================
// GET PRESIGNED URL FOR PART
// ======================================================

app.post("/upload/presign-part", async (req, res) => {
    try {
        if (!checkR2(res)) return;

        const {
            uploadId,
            partNumber
        } = req.body;

        if (!uploadId || !partNumber) {
            return res.status(400).json({
                success: false,
                error: "Missing upload part information."
            });
        }

        const upload = activeUploads.get(uploadId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                error: "Upload not found."
            });
        }

        const part = Number(partNumber);

        if (
            !Number.isInteger(part) ||
            part < 1 ||
            part > 10000
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid part number."
            });
        }

        const command = new UploadPartCommand({
            Bucket: R2_BUCKET_NAME,
            Key: upload.key,
            UploadId: uploadId,
            PartNumber: part
        });

        const signedUrl = await getSignedUrl(
            r2,
            command,
            {
                expiresIn: 60 * 60
            }
        );

        res.json({
            success: true,
            url: signedUrl
        });

    } catch (error) {

        console.error("Presign error:", error);

        res.status(500).json({
            success: false,
            error: "Could not create upload URL."
        });
    }
});

// ======================================================
// COMPLETE MULTIPART UPLOAD
// ======================================================

app.post("/upload/complete", async (req, res) => {
    try {
        if (!checkR2(res)) return;

        const {
            uploadId,
            parts
        } = req.body;

        if (!uploadId || !Array.isArray(parts)) {
            return res.status(400).json({
                success: false,
                error: "Missing upload completion information."
            });
        }

        const upload = activeUploads.get(uploadId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                error: "Upload not found."
            });
        }

        const room = rooms.get(upload.roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: "Room no longer exists."
            });
        }

        // Only original host can complete upload
        if (upload.socketId !== room.hostId) {
            return res.status(403).json({
                success: false,
                error: "Only the host can complete the upload."
            });
        }

        const cleanedParts = parts
            .map((part) => ({
                ETag: part.ETag,
                PartNumber: Number(part.PartNumber)
            }))
            .filter(
                (part) =>
                    part.ETag &&
                    Number.isInteger(part.PartNumber)
            )
            .sort(
                (a, b) =>
                    a.PartNumber - b.PartNumber
            );

        if (cleanedParts.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No uploaded parts found."
            });
        }

        const command =
            new CompleteMultipartUploadCommand({
                Bucket: R2_BUCKET_NAME,
                Key: upload.key,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: cleanedParts
                }
            });

        await r2.send(command);

        // Save movie in room
        room.movieKey = upload.key;
        room.movieName = upload.fileName;

        // Reset playback
        room.playing = false;
        room.currentTime = 0;
        room.updatedAt = Date.now();

        activeUploads.delete(uploadId);

        // Create a temporary playback URL
        const getCommand =
            new GetObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: room.movieKey
            });

        const movieUrl = await getSignedUrl(
            r2,
            getCommand,
            {
                expiresIn: 60 * 60 * 24
            }
        );

        console.log(
            `R2 upload completed: ${upload.fileName}`
        );

        // Tell everyone
        io.to(upload.roomId).emit(
            "movie-changed",
            {
                movieUrl,
                movieName: room.movieName
            }
        );

        res.json({
            success: true,
            movieUrl,
            movieName: room.movieName
        });

    } catch (error) {

        console.error(
            "R2 complete error:",
            error
        );

        res.status(500).json({
            success: false,
            error: "Could not complete upload."
        });
    }
});

// ======================================================
// ABORT UPLOAD
// ======================================================

app.post("/upload/abort", async (req, res) => {
    try {
        if (!checkR2(res)) return;

        const { uploadId } = req.body;

        const upload =
            activeUploads.get(uploadId);

        if (!upload) {
            return res.json({
                success: true
            });
        }

        const command =
            new AbortMultipartUploadCommand({
                Bucket: R2_BUCKET_NAME,
                Key: upload.key,
                UploadId: uploadId
            });

        await r2.send(command);

        activeUploads.delete(uploadId);

        console.log(
            `R2 upload aborted: ${upload.fileName}`
        );

        res.json({
            success: true
        });

    } catch (error) {

        console.error(
            "R2 abort error:",
            error
        );

        res.status(500).json({
            success: false,
            error: "Could not abort upload."
        });
    }
});

// ======================================================
// SOCKET.IO
// ======================================================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );

    // ==================================================
    // JOIN ROOM
    // ==================================================

    socket.on(
        "join-room",
        async ({ roomId, name }) => {

            const room = rooms.get(roomId);

            if (!room) {

                socket.emit(
                    "room-error",
                    "Room not found."
                );

                return;
            }

            socket.join(roomId);

            // First user becomes host
            if (!room.hostId) {
                room.hostId = socket.id;
            }

            const userName =
                name || "Guest";

            room.users.set(
                socket.id,
                {
                    name: userName
                }
            );

            socket.roomId = roomId;
            socket.userName = userName;

            let movieUrl = null;

            // Create fresh signed URL
            // for existing movie
            if (room.movieKey) {

                try {

                    const command =
                        new GetObjectCommand({
                            Bucket:
                                R2_BUCKET_NAME,
                            Key:
                                room.movieKey
                        });

                    movieUrl =
                        await getSignedUrl(
                            r2,
                            command,
                            {
                                expiresIn:
                                    60 * 60 * 24
                            }
                        );

                } catch (error) {

                    console.error(
                        "Could not create movie URL:",
                        error
                    );
                }
            }

            // Send current room state
            socket.emit(
                "room-state",
                {
                    roomId,
                    isHost:
                        socket.id ===
                        room.hostId,

                    playing:
                        room.playing,

                    currentTime:
                        room.currentTime,

                    movieUrl,
                    movieName:
                        room.movieName
                }
            );

            // Users
            io.to(roomId).emit(
                "users-update",
                getUsers(room)
            );

            // Host
            io.to(roomId).emit(
                "host-changed",
                room.hostId
            );

            console.log(
                `${userName} joined room ${roomId}`
            );
        }
    );

    // ==================================================
    // CHAT
    // ==================================================

    socket.on(
        "chat-message",
        (message) => {

            const roomId =
                socket.roomId;

            if (
                !roomId ||
                !rooms.has(roomId)
            ) {
                return;
            }

            const cleanMessage =
                String(message).slice(
                    0,
                    300
                );

            io.to(roomId).emit(
                "chat-message",
                {
                    name:
                        socket.userName ||
                        "Guest",

                    message:
                        cleanMessage
                }
            );
        }
    );

    // ==================================================
    // VIDEO CONTROL
    // ==================================================

    socket.on(
        "video-control",
        (data) => {

            const roomId =
                socket.roomId;

            const room =
                rooms.get(roomId);

            if (!room) {
                return;
            }

            // Only host controls movie
            if (
                socket.id !==
                room.hostId
            ) {
                return;
            }

            if (
                data.action ===
                "play"
            ) {

                room.playing = true;

                room.currentTime =
                    Number(
                        data.currentTime
                    ) || 0;

                room.updatedAt =
                    Date.now();
            }

            if (
                data.action ===
                "pause"
            ) {

                room.playing = false;

                room.currentTime =
                    Number(
                        data.currentTime
                    ) || 0;

                room.updatedAt =
                    Date.now();
            }

            if (
                data.action ===
                "seek"
            ) {

                room.currentTime =
                    Number(
                        data.currentTime
                    ) || 0;

                room.updatedAt =
                    Date.now();
            }

            socket
                .to(roomId)
                .emit(
                    "video-control",
                    {
                        action:
                            data.action,

                        currentTime:
                            room.currentTime
                    }
                );
        }
    );

    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on(
        "disconnect",
        () => {

            const roomId =
                socket.roomId;

            if (!roomId) {
                return;
            }

            const room =
                rooms.get(roomId);

            if (!room) {
                return;
            }

            room.users.delete(
                socket.id
            );

            // Host leaves
            if (
                socket.id ===
                room.hostId
            ) {

                const nextUser =
                    room.users.keys().next();

                if (!nextUser.done) {

                    room.hostId =
                        nextUser.value;

                } else {

                    rooms.delete(
                        roomId
                    );

                    console.log(
                        `Room ${roomId} deleted`
                    );

                    return;
                }

                io.to(roomId).emit(
                    "host-changed",
                    room.hostId
                );
            }

            io.to(roomId).emit(
                "users-update",
                getUsers(room)
            );

            console.log(
                "User disconnected:",
                socket.id
            );
        }
    );
});

// ======================================================
// GET USERS
// ======================================================

function getUsers(room) {

    const users = [];

    for (
        const [id, user]
        of room.users
    ) {

        users.push({
            id,

            name:
                user.name,

            isHost:
                id === room.hostId
        });
    }

    return users;
}

// ======================================================
// START SERVER
// ======================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Watch Together server running on port ${PORT}`
        );

        console.log(
            "Cloudflare R2 upload system ready."
        );
    }
);