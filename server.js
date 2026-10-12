const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;


// =====================================================
// UPLOAD FOLDER
// =====================================================

const uploadDir = path.join(
    __dirname,
    "public",
    "uploads"
);

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}


// =====================================================
// SERVE PUBLIC FILES
// =====================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// IMPORTANT:
// Explicitly serve uploaded movies
app.use(
    "/uploads",
    express.static(uploadDir)
);


// =====================================================
// MULTER UPLOAD SETTINGS
// =====================================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        cb(null, uploadDir);

    },

    filename: (req, file, cb) => {

        const extension =
            path.extname(file.originalname);

        const uniqueName =
            Date.now() +
            "-" +
            crypto.randomBytes(6).toString("hex") +
            extension;

        cb(null, uniqueName);

    }

});


const upload = multer({

    storage: storage,

    limits: {

        // Maximum 5 GB
        fileSize:
            5 * 1024 * 1024 * 1024

    }

});


// =====================================================
// ROOMS
// =====================================================

const rooms = new Map();


// =====================================================
// CREATE ROOM ID
// =====================================================

function createRoomId() {

    return crypto
        .randomBytes(4)
        .toString("hex");

}


// =====================================================
// CREATE ROOM
// =====================================================

app.get("/create-room", (req, res) => {

    const roomId =
        createRoomId();

    rooms.set(roomId, {

        hostId: null,

        users: new Map(),

        playing: false,

        currentTime: 0,

        updatedAt: Date.now(),

        movieUrl: null,

        movieName: null

    });

    res.redirect(
        `/room/${roomId}`
    );

});


// =====================================================
// OPEN ROOM
// =====================================================

app.get("/room/:roomId", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


// =====================================================
// UPLOAD MOVIE
// =====================================================

app.post(
    "/upload-movie",
    upload.single("movie"),
    (req, res) => {

        try {

            const roomId =
                req.body.roomId;

            const room =
                rooms.get(roomId);


            // Room doesn't exist
            if (!room) {

                if (req.file) {

                    try {

                        fs.unlinkSync(
                            req.file.path
                        );

                    } catch (error) {

                        console.log(
                            "Could not delete uploaded file."
                        );

                    }

                }

                return res
                    .status(404)
                    .json({

                        success: false,

                        message:
                            "Room not found."

                    });

            }


            // No file
            if (!req.file) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "No movie selected."

                    });

            }


            console.log(
                "Movie uploaded:",
                req.file.filename
            );


            console.log(
                "Movie location:",
                req.file.path
            );


            // URL used by browser
            const movieUrl =
                "/uploads/" +
                encodeURIComponent(
                    req.file.filename
                );


            res.json({

                success: true,

                movieUrl:
                    movieUrl,

                movieName:
                    req.file.originalname

            });

        }

        catch (error) {

            console.error(
                "UPLOAD ERROR:",
                error
            );

            res
                .status(500)
                .json({

                    success: false,

                    message:
                        "Movie upload failed."

                });

        }

    }
);


// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );


    // =================================================
    // JOIN ROOM
    // =================================================

    socket.on(
        "join-room",
        ({ roomId, name }) => {

            const room =
                rooms.get(roomId);


            if (!room) {

                socket.emit(
                    "room-error",
                    "Room not found."
                );

                return;

            }


            socket.join(roomId);


            // First person becomes host
            if (!room.hostId) {

                room.hostId =
                    socket.id;

            }


            room.users.set(
                socket.id,
                {

                    name:
                        name ||
                        "Guest"

                }
            );


            socket.roomId =
                roomId;

            socket.userName =
                name ||
                "Guest";


            // Send current room state
            socket.emit(
                "room-state",
                {

                    roomId:
                        roomId,

                    isHost:
                        socket.id ===
                        room.hostId,

                    playing:
                        room.playing,

                    currentTime:
                        room.currentTime,

                    movieUrl:
                        room.movieUrl,

                    movieName:
                        room.movieName

                }
            );


            // Update users
            io.to(roomId).emit(
                "users-update",
                getUsers(room)
            );


            // Update host
            io.to(roomId).emit(
                "host-changed",
                room.hostId
            );


            console.log(
                `${name || "Guest"} joined room ${roomId}`
            );

        }
    );


    // =================================================
    // MOVIE UPLOADED
    // =================================================

    socket.on(
        "movie-uploaded",
        (data) => {

            const roomId =
                socket.roomId;

            const room =
                rooms.get(roomId);


            if (!room) {

                return;

            }


            // Only host can upload
            if (
                socket.id !==
                room.hostId
            ) {

                return;

            }


            room.movieUrl =
                data.movieUrl;

            room.movieName =
                data.movieName ||
                "Movie";


            // Reset video
            room.playing =
                false;

            room.currentTime =
                0;

            room.updatedAt =
                Date.now();


            console.log(
                "Movie added to room:",
                roomId
            );


            console.log(
                "Movie URL:",
                room.movieUrl
            );


            // Tell everyone
            io.to(roomId).emit(
                "movie-changed",
                {

                    movieUrl:
                        room.movieUrl,

                    movieName:
                        room.movieName

                }
            );

        }
    );


    // =================================================
    // CHAT
    // =================================================

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
                String(message)
                    .slice(0, 300);


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


    // =================================================
    // VIDEO CONTROLS
    // =================================================

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


            // Only host controls video
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

                room.playing =
                    true;

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

                room.playing =
                    false;

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


            // Send to everyone except host
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


    // =================================================
    // DISCONNECT
    // =================================================

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


            // If host leaves
            if (
                socket.id ===
                room.hostId
            ) {

                const nextUser =
                    room.users
                        .keys()
                        .next();


                if (!nextUser.done) {

                    room.hostId =
                        nextUser.value;

                }

                else {

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


// =====================================================
// GET USERS
// =====================================================

function getUsers(room) {

    const users = [];


    for (
        const [id, user]
        of room.users
    ) {

        users.push({

            id:
                id,

            name:
                user.name,

            isHost:
                id ===
                room.hostId

        });

    }


    return users;

}


// =====================================================
// START SERVER
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Watch Together server running on port ${PORT}`
        );

        console.log(
            `Upload folder: ${uploadDir}`
        );

    }
);