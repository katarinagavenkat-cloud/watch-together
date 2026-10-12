const socket = io();

const homePage = document.getElementById("homePage");
const roomPage = document.getElementById("roomPage");
const joinModal = document.getElementById("joinModal");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const nameInput = document.getElementById("nameInput");
const roomIdDisplay = document.getElementById("roomIdDisplay");

const video = document.getElementById("video");

const usersList = document.getElementById("usersList");
const hostStatus = document.getElementById("hostStatus");

const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

let roomId = null;
let myName = null;
let isHost = false;

let remoteVideoChange = false;


// CREATE ROOM
createRoomBtn.addEventListener("click", () => {
    window.location.href = "/create-room";
});


// CHECK ROOM URL
const pathParts = window.location.pathname.split("/");

if (
    pathParts.length >= 3 &&
    pathParts[1] === "room" &&
    pathParts[2]
) {
    roomId = pathParts[2];

    roomIdDisplay.textContent = roomId;

    homePage.classList.add("hidden");
    roomPage.classList.remove("hidden");

    joinModal.classList.remove("hidden");
}


// JOIN ROOM
joinRoomBtn.addEventListener("click", joinRoom);

nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        joinRoom();
    }
});

function joinRoom() {

    const name = nameInput.value.trim();

    if (!name) {
        alert("Please enter your name.");
        return;
    }

    myName = name;

    joinModal.classList.add("hidden");

    socket.emit("join-room", {
        roomId: roomId,
        name: myName
    });
}


// ROOM STATE
socket.on("room-state", (state) => {

    isHost = state.isHost;

    updateHostStatus();

    remoteVideoChange = true;

    video.currentTime = state.currentTime || 0;

    if (state.playing) {

        video.play().catch(() => {
            showPlaybackMessage();
        });

    } else {

        video.pause();
    }

    setTimeout(() => {
        remoteVideoChange = false;
    }, 200);
});


// HOST STATUS
function updateHostStatus() {

    if (isHost) {

        hostStatus.textContent = "👑 You are the host";
        video.controls = true;

    } else {

        hostStatus.textContent =
            "🎬 The host controls the movie";

        video.controls = false;
    }
}


// PLAYBACK MESSAGE
function showPlaybackMessage() {

    if (isHost) return;

    hostStatus.textContent =
        "▶️ Tap the video once to enable playback";

    setTimeout(() => {
        updateHostStatus();
    }, 4000);
}


// HOST CHANGED
socket.on("host-changed", (hostId) => {

    isHost = socket.id === hostId;

    updateHostStatus();
});


// USERS UPDATE
socket.on("users-update", (users) => {

    usersList.innerHTML = "";

    users.forEach((user) => {

        const li = document.createElement("li");

        if (user.isHost) {

            li.textContent = `${user.name} 👑`;

        } else {

            li.textContent = user.name;
        }

        usersList.appendChild(li);
    });
});


// HOST PLAY
video.addEventListener("play", () => {

    if (remoteVideoChange) return;

    if (!isHost) return;

    socket.emit("video-control", {
        action: "play",
        currentTime: video.currentTime
    });
});


// HOST PAUSE
video.addEventListener("pause", () => {

    if (remoteVideoChange) return;

    if (!isHost) return;

    socket.emit("video-control", {
        action: "pause",
        currentTime: video.currentTime
    });
});


// HOST SEEK
video.addEventListener("seeked", () => {

    if (remoteVideoChange) return;

    if (!isHost) return;

    socket.emit("video-control", {
        action: "seek",
        currentTime: video.currentTime
    });
});


// RECEIVE VIDEO CONTROL
socket.on("video-control", (data) => {

    remoteVideoChange = true;

    video.currentTime = data.currentTime || 0;

    if (data.action === "play") {

        video.play().catch(() => {
            showPlaybackMessage();
        });

    } else if (data.action === "pause") {

        video.pause();

    } else if (data.action === "seek") {

        video.currentTime = data.currentTime || 0;
    }

    setTimeout(() => {
        remoteVideoChange = false;
    }, 200);
});


// SEND CHAT
sendMessageBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        sendMessage();
    }
});

function sendMessage() {

    const message = messageInput.value.trim();

    if (!message) return;

    socket.emit("chat-message", message);

    messageInput.value = "";
}


// RECEIVE CHAT
socket.on("chat-message", (data) => {

    const messageElement = document.createElement("div");

    messageElement.className = "message";

    const nameElement = document.createElement("strong");

    nameElement.textContent = data.name + ": ";

    const textElement = document.createElement("span");

    textElement.textContent = data.message;

    messageElement.appendChild(nameElement);
    messageElement.appendChild(textElement);

    messages.appendChild(messageElement);

    messages.scrollTop = messages.scrollHeight;
});


// ROOM ERROR
socket.on("room-error", (message) => {

    alert(message);

    window.location.href = "/";
});