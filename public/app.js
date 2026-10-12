const socket = io();

const homePage = document.getElementById("homePage");
const roomPage = document.getElementById("roomPage");
const joinModal = document.getElementById("joinModal");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const nameInput = document.getElementById("nameInput");
const roomIdDisplay = document.getElementById("roomIdDisplay");

const video = document.getElementById("video");
const emptyMovie = document.getElementById("emptyMovie");

const movieTitle = document.getElementById("movieTitle");

const uploadSection = document.getElementById("uploadSection");
const movieInput = document.getElementById("movieInput");
const uploadMovieBtn = document.getElementById("uploadMovieBtn");
const uploadStatus = document.getElementById("uploadStatus");

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

    // No movie uploaded yet
    if (!state.movieUrl) {

        showEmptyMovie();

        return;

    }

    loadMovie(
        state.movieUrl,
        state.movieName || "Movie",
        state.currentTime || 0,
        state.playing
    );

});


// HOST STATUS
function updateHostStatus() {

    if (isHost) {

        hostStatus.textContent = "👑 You are the host";

        video.controls = true;

        uploadSection.classList.remove("hidden");

    } else {

        hostStatus.textContent =
            "🎬 The host controls the movie";

        video.controls = false;

        uploadSection.classList.add("hidden");

    }

}


// SHOW EMPTY MOVIE AREA
function showEmptyMovie() {

    remoteVideoChange = true;

    video.pause();

    video.removeAttribute("src");

    video.load();

    video.classList.add("hidden");

    emptyMovie.classList.remove("hidden");

    movieTitle.textContent = "No movie selected";

    setTimeout(() => {

        remoteVideoChange = false;

    }, 200);

}


// LOAD MOVIE
function loadMovie(
    movieUrl,
    movieName,
    currentTime,
    playing
) {

    remoteVideoChange = true;

    emptyMovie.classList.add("hidden");

    video.classList.remove("hidden");

    movieTitle.textContent = movieName;

    video.src = movieUrl;

    video.load();

    video.addEventListener(
        "loadedmetadata",
        function setMovieTime() {

            video.removeEventListener(
                "loadedmetadata",
                setMovieTime
            );

            video.currentTime = currentTime || 0;

            if (playing) {

                video.play().catch(() => {

                    showPlaybackMessage();

                });

            } else {

                video.pause();

            }

            setTimeout(() => {

                remoteVideoChange = false;

            }, 300);

        }
    );

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


// MOVIE CHANGED
socket.on("movie-changed", (data) => {

    loadMovie(
        data.movieUrl,
        data.movieName || "Movie",
        0,
        false
    );

});


// UPLOAD MOVIE
uploadMovieBtn.addEventListener("click", async () => {

    if (!isHost) {

        return;

    }

    const file = movieInput.files[0];

    if (!file) {

        alert("Please select a movie.");

        return;

    }

    uploadStatus.textContent = "Uploading...";

    uploadMovieBtn.disabled = true;


    try {

        const formData = new FormData();

        formData.append("movie", file);

        formData.append("roomId", roomId);


        const response = await fetch(
            "/upload-movie",
            {
                method: "POST",
                body: formData
            }
        );


        const result = await response.json();


        if (!response.ok || !result.success) {

            throw new Error(
                result.message || "Upload failed."
            );

        }


        uploadStatus.textContent =
            "Movie uploaded successfully.";


        socket.emit("movie-uploaded", {

            movieUrl: result.movieUrl,

            movieName: result.movieName

        });


        movieInput.value = "";


    } catch (error) {

        console.error(error);

        uploadStatus.textContent =
            "Upload failed.";

        alert(
            "Movie upload failed. Please try again."
        );

    }


    uploadMovieBtn.disabled = false;

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

    }


    else if (data.action === "pause") {

        video.pause();

    }


    else if (data.action === "seek") {

        video.currentTime =
            data.currentTime || 0;

    }


    setTimeout(() => {

        remoteVideoChange = false;

    }, 200);

});


// SEND CHAT
sendMessageBtn.addEventListener(
    "click",
    sendMessage
);


messageInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

        sendMessage();

    }

});


function sendMessage() {

    const message =
        messageInput.value.trim();

    if (!message) return;

    socket.emit(
        "chat-message",
        message
    );

    messageInput.value = "";

}


// RECEIVE CHAT
socket.on("chat-message", (data) => {

    const messageElement =
        document.createElement("div");

    messageElement.className = "message";


    const nameElement =
        document.createElement("strong");

    nameElement.textContent =
        data.name + ": ";


    const textElement =
        document.createElement("span");

    textElement.textContent =
        data.message;


    messageElement.appendChild(
        nameElement
    );

    messageElement.appendChild(
        textElement
    );


    messages.appendChild(
        messageElement
    );


    messages.scrollTop =
        messages.scrollHeight;

});


// ROOM ERROR
socket.on("room-error", (message) => {

    alert(message);

    window.location.href = "/";

});