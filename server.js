const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve files from public folder
app.use(express.static("public"));

// Store rooms
const rooms = new Map();

// Generate a short room ID
function createRoomId() {
    return crypto.randomBytes(4).toString("hex");
}

// Create a new room
app.get("/create-room", (req, res) => {
    const roomId = createRoomId();

    rooms.set(roomId, {
        hostId: null,
        users: new Map(),
        playing: false,
        currentTime: 0,
        updatedAt: Date.now()
    });

    res.redirect(`/room/${roomId}`);
});

// Open a room
app.get("/room/:roomId", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// Socket.IO
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, name }) => {
        const room = rooms.get(roomId);

        if (!room) {
            socket.emit("room-error", "Room not found.");
            return;
        }

        socket.join(roomId);

        // First user becomes host
        if (!room.hostId) {
            room.hostId = socket.id;
        }

        room.users.set(socket.id, {
            name: name || "Guest"
        });

        socket.roomId = roomId;
        socket.userName = name || "Guest";

        // Send current room information to new user
        socket.emit("room-state", {
            roomId,
            isHost: socket.id === room.hostId,
            playing: room.playing,
            currentTime: room.currentTime
        });

        // Tell everyone about users
        io.to(roomId).emit("users-update", getUsers(room));

        // Tell everyone who the host is
        io.to(roomId).emit("host-changed", room.hostId);

        console.log(`${name || "Guest"} joined room ${roomId}`);
    });

    // Chat
    socket.on("chat-message", (message) => {
        const roomId = socket.roomId;

        if (!roomId || !rooms.has(roomId)) return;

        const cleanMessage = String(message).slice(0, 300);

        io.to(roomId).emit("chat-message", {
            name: socket.userName || "Guest",
            message: cleanMessage
        });
    });

    // Video controls
    socket.on("video-control", (data) => {
        const roomId = socket.roomId;
        const room = rooms.get(roomId);

        if (!room) return;

        // Only host controls the movie
        if (socket.id !== room.hostId) {
            return;
        }

        if (data.action === "play") {
            room.playing = true;
            room.currentTime = Number(data.currentTime) || 0;
            room.updatedAt = Date.now();
        }

        if (data.action === "pause") {
            room.playing = false;
            room.currentTime = Number(data.currentTime) || 0;
            room.updatedAt = Date.now();
        }

        if (data.action === "seek") {
            room.currentTime = Number(data.currentTime) || 0;
            room.updatedAt = Date.now();
        }

        // Send control to everyone except host
        socket.to(roomId).emit("video-control", {
            action: data.action,
            currentTime: room.currentTime
        });
    });

    // Disconnect
    socket.on("disconnect", () => {
        const roomId = socket.roomId;

        if (!roomId) return;

        const room = rooms.get(roomId);

        if (!room) return;

        room.users.delete(socket.id);

        // If host leaves, choose another user
        if (socket.id === room.hostId) {
            const nextUser = room.users.keys().next();

            if (!nextUser.done) {
                room.hostId = nextUser.value;
            } else {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted`);
                return;
            }

            io.to(roomId).emit("host-changed", room.hostId);
        }

        io.to(roomId).emit("users-update", getUsers(room));

        console.log("User disconnected:", socket.id);
    });
});

// Get users in room
function getUsers(room) {
    const users = [];

    for (const [id, user] of room.users) {
        users.push({
            id,
            name: user.name,
            isHost: id === room.hostId
        });
    }

    return users;
}

server.listen(PORT, () => {
    console.log(`Watch Together server running on port ${PORT}`);
});