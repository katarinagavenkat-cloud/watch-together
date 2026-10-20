const socket = io();

// ======================================================
// PAGE ELEMENTS
// ======================================================

const homePage = document.getElementById("homePage");
const roomPage = document.getElementById("roomPage");
const joinModal = document.getElementById("joinModal");

const createRoomBtn =
    document.getElementById("createRoomBtn");

const joinRoomBtn =
    document.getElementById("joinRoomBtn");

const nameInput =
    document.getElementById("nameInput");

const roomIdDisplay =
    document.getElementById("roomIdDisplay");

const video =
    document.getElementById("video");

const emptyMovie =
    document.getElementById("emptyMovie");

const uploadSection =
    document.getElementById("uploadSection");

const movieInput =
    document.getElementById("movieInput");

const uploadMovieBtn =
    document.getElementById("uploadMovieBtn");

const uploadStatus =
    document.getElementById("uploadStatus");

const movieTitle =
    document.getElementById("movieTitle");

const usersList =
    document.getElementById("usersList");

const hostStatus =
    document.getElementById("hostStatus");

const messages =
    document.getElementById("messages");

const messageInput =
    document.getElementById("messageInput");

const sendMessageBtn =
    document.getElementById("sendMessageBtn");

// ======================================================
// VARIABLES
// ======================================================

let roomId = null;
let myName = null;
let isHost = false;

let remoteVideoChange = false;

let currentMovieUrl = null;

let currentUploadId = null;

// ======================================================
// CREATE ROOM
// ======================================================

createRoomBtn.addEventListener(
    "click",
    () => {
        window.location.href =
            "/create-room";
    }
);

// ======================================================
// CHECK ROOM URL
// ======================================================

const pathParts =
    window.location.pathname.split("/");

if (
    pathParts.length >= 3 &&
    pathParts[1] === "room" &&
    pathParts[2]
) {

    roomId = pathParts[2];

    roomIdDisplay.textContent =
        roomId;

    homePage.classList.add(
        "hidden"
    );

    roomPage.classList.remove(
        "hidden"
    );

    joinModal.classList.remove(
        "hidden"
    );
}

// ======================================================
// JOIN ROOM
// ======================================================

joinRoomBtn.addEventListener(
    "click",
    joinRoom
);

nameInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key ===
            "Enter"
        ) {
            joinRoom();
        }
    }
);

function joinRoom() {

    const name =
        nameInput.value.trim();

    if (!name) {

        alert(
            "Please enter your name."
        );

        return;
    }

    myName = name;

    joinModal.classList.add(
        "hidden"
    );

    socket.emit(
        "join-room",
        {
            roomId,
            name: myName
        }
    );
}

// ======================================================
// ROOM STATE
// ======================================================

socket.on(
    "room-state",
    (state) => {

        isHost =
            state.isHost;

        updateHostStatus();

        // Existing movie
        if (
            state.movieUrl
        ) {

            setMovie(
                state.movieUrl,
                state.movieName
            );

        } else {

            showEmptyMovie();
        }

        // Restore playback position
        remoteVideoChange =
            true;

        if (
            video.readyState >= 1
        ) {

            video.currentTime =
                state.currentTime || 0;
        }

        if (
            state.playing &&
            state.movieUrl
        ) {

            video.play().catch(
                () => {
                    showPlaybackMessage();
                }
            );

        } else {

            video.pause();
        }

        setTimeout(
            () => {
                remoteVideoChange =
                    false;
            },
            300
        );
    }
);

// ======================================================
// HOST STATUS
// ======================================================

function updateHostStatus() {

    if (isHost) {

        hostStatus.textContent =
            "👑 You are the host";

        video.controls = true;

        // Show upload area
        if (uploadSection) {

            uploadSection.classList.remove(
                "hidden"
            );
        }

    } else {

        hostStatus.textContent =
            "🎬 The host controls the movie";

        video.controls = false;

        // Hide upload area
        if (uploadSection) {

            uploadSection.classList.add(
                "hidden"
            );
        }
    }
}

// ======================================================
// EMPTY MOVIE
// ======================================================

function showEmptyMovie() {

    currentMovieUrl = null;

    if (video) {

        video.pause();

        video.removeAttribute(
            "src"
        );

        video.load();

        video.classList.add(
            "hidden"
        );
    }

    if (emptyMovie) {

        emptyMovie.classList.remove(
            "hidden"
        );
    }

    if (movieTitle) {

        movieTitle.textContent =
            "No movie selected";
    }
}

// ======================================================
// SET MOVIE
// ======================================================

function setMovie(
    movieUrl,
    movieName
) {

    if (!movieUrl) {

        showEmptyMovie();

        return;
    }

    currentMovieUrl =
        movieUrl;

    if (emptyMovie) {

        emptyMovie.classList.add(
            "hidden"
        );
    }

    if (video) {

        video.classList.remove(
            "hidden"
        );

        video.src =
            movieUrl;

        video.load();
    }

    if (movieTitle) {

        movieTitle.textContent =
            movieName ||
            "Movie";
    }
}

// ======================================================
// PLAYBACK MESSAGE
// ======================================================

function showPlaybackMessage() {

    if (isHost) {
        return;
    }

    hostStatus.textContent =
        "▶️ Tap the video once to enable playback";

    setTimeout(
        () => {
            updateHostStatus();
        },
        4000
    );
}

// ======================================================
// HOST CHANGED
// ======================================================

socket.on(
    "host-changed",
    (hostId) => {

        isHost =
            socket.id === hostId;

        updateHostStatus();
    }
);

// ======================================================
// USERS UPDATE
// ======================================================

socket.on(
    "users-update",
    (users) => {

        usersList.innerHTML =
            "";

        users.forEach(
            (user) => {

                const li =
                    document.createElement(
                        "li"
                    );

                if (
                    user.isHost
                ) {

                    li.textContent =
                        `${user.name} 👑`;

                } else {

                    li.textContent =
                        user.name;
                }

                usersList.appendChild(
                    li
                );
            }
        );
    }
);

// ======================================================
// MOVIE UPLOADED / CHANGED
// ======================================================

socket.on(
    "movie-changed",
    (data) => {

        setMovie(
            data.movieUrl,
            data.movieName
        );

        remoteVideoChange =
            true;

        video.currentTime =
            0;

        video.pause();

        setTimeout(
            () => {
                remoteVideoChange =
                    false;
            },
            500
        );

        if (uploadStatus) {

            uploadStatus.textContent =
                "✅ Movie uploaded successfully!";
        }
    }
);

// ======================================================
// HOST PLAY
// ======================================================

video.addEventListener(
    "play",
    () => {

        if (
            remoteVideoChange
        ) {
            return;
        }

        if (!isHost) {
            return;
        }

        socket.emit(
            "video-control",
            {
                action: "play",
                currentTime:
                    video.currentTime
            }
        );
    }
);

// ======================================================
// HOST PAUSE
// ======================================================

video.addEventListener(
    "pause",
    () => {

        if (
            remoteVideoChange
        ) {
            return;
        }

        if (!isHost) {
            return;
        }

        socket.emit(
            "video-control",
            {
                action: "pause",
                currentTime:
                    video.currentTime
            }
        );
    }
);

// ======================================================
// HOST SEEK
// ======================================================

video.addEventListener(
    "seeked",
    () => {

        if (
            remoteVideoChange
        ) {
            return;
        }

        if (!isHost) {
            return;
        }

        socket.emit(
            "video-control",
            {
                action: "seek",
                currentTime:
                    video.currentTime
            }
        );
    }
);

// ======================================================
// RECEIVE VIDEO CONTROL
// ======================================================

socket.on(
    "video-control",
    (data) => {

        remoteVideoChange =
            true;

        if (
            video.readyState >= 1
        ) {

            video.currentTime =
                data.currentTime || 0;
        }

        if (
            data.action ===
            "play"
        ) {

            video.play().catch(
                () => {
                    showPlaybackMessage();
                }
            );

        } else if (
            data.action ===
            "pause"
        ) {

            video.pause();

        } else if (
            data.action ===
            "seek"
        ) {

            video.currentTime =
                data.currentTime || 0;
        }

        setTimeout(
            () => {
                remoteVideoChange =
                    false;
            },
            300
        );
    }
);

// ======================================================
// UPLOAD MOVIE BUTTON
// ======================================================

if (uploadMovieBtn) {

    uploadMovieBtn.addEventListener(
        "click",
        startMovieUpload
    );
}

// ======================================================
// START MOVIE UPLOAD
// ======================================================

async function startMovieUpload() {

    if (!isHost) {

        alert(
            "Only the host can upload a movie."
        );

        return;
    }

    const file =
        movieInput.files[0];

    if (!file) {

        alert(
            "Please select a movie first."
        );

        return;
    }

    // ==================================================
    // IMPORTANT
    // No extension restriction here.
    // MKV, MP4, AVI, MOV, WEBM, etc. can be uploaded.
    // Browser playback is a separate issue.
    // ==================================================

    uploadMovieBtn.disabled =
        true;

    movieInput.disabled =
        true;

    uploadStatus.textContent =
        "Preparing upload...";

    let uploadId = null;

    try {

        // ==================================================
        // 1. START MULTIPART UPLOAD
        // ==================================================

        const initiateResponse =
            await fetch(
                "/upload/initiate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            {
                                roomId,
                                socketId:
                                    socket.id,

                                fileName:
                                    file.name,

                                contentType:
                                    file.type ||
                                    "application/octet-stream"
                            }
                        )
                }
            );

        const initiateData =
            await readJsonResponse(
                initiateResponse
            );

        if (
            !initiateResponse.ok ||
            !initiateData.success
        ) {

            throw new Error(
                initiateData.error ||
                "Could not start upload."
            );
        }

        uploadId =
            initiateData.uploadId;

        currentUploadId =
            uploadId;

        const key =
            initiateData.key;

        console.log(
            "R2 upload started:",
            key
        );

        // ==================================================
        // 2. SPLIT FILE INTO PARTS
        // ==================================================

        // 100 MB chunks
        const PART_SIZE =
            100 * 1024 * 1024;

        const totalParts =
            Math.ceil(
                file.size /
                PART_SIZE
            );

        const completedParts =
            [];

        let uploadedBytes =
            0;

        // ==================================================
        // 3. UPLOAD PARTS
        // ==================================================

        // Keep only a few simultaneous uploads
        // so mobile/PC memory is not overloaded.
        const CONCURRENCY = 3;

        let nextPart =
            1;

        async function uploadNextPart() {

            while (true) {

                const partNumber =
                    nextPart++;

                if (
                    partNumber >
                    totalParts
                ) {
                    return;
                }

                const start =
                    (partNumber - 1) *
                    PART_SIZE;

                const end =
                    Math.min(
                        start +
                        PART_SIZE,
                        file.size
                    );

                const chunk =
                    file.slice(
                        start,
                        end
                    );

                uploadStatus.textContent =
                    `Preparing part ${partNumber} of ${totalParts}...`;

                // ==================================================
                // Get signed URL
                // ==================================================

                const presignResponse =
                    await fetch(
                        "/upload/presign-part",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    {
                                        uploadId,
                                        partNumber
                                    }
                                )
                        }
                    );

                const presignData =
                    await readJsonResponse(
                        presignResponse
                    );

                if (
                    !presignResponse.ok ||
                    !presignData.success
                ) {

                    throw new Error(
                        presignData.error ||
                        `Could not prepare part ${partNumber}.`
                    );
                }

                // ==================================================
                // Upload directly to R2
                // ==================================================

                const uploadResponse =
                    await fetch(
                        presignData.url,
                        {
                            method: "PUT",

                            body: chunk
                        }
                    );

                if (
                    !uploadResponse.ok
                ) {

                    throw new Error(
                        `Part ${partNumber} upload failed.`
                    );
                }

                const etag =
                    uploadResponse.headers.get(
                        "ETag"
                    );

                if (!etag) {

                    throw new Error(
                        "R2 did not return an ETag. Check R2 CORS settings."
                    );
                }

                completedParts.push(
                    {
                        ETag: etag,
                        PartNumber:
                            partNumber
                    }
                );

                uploadedBytes +=
                    chunk.size;

                const percent =
                    Math.min(
                        100,
                        Math.round(
                            (
                                uploadedBytes /
                                file.size
                            ) * 100
                        )
                    );

                uploadStatus.textContent =
                    `Uploading ${percent}% — part ${partNumber} of ${totalParts}`;

                console.log(
                    `Uploaded part ${partNumber}/${totalParts}`
                );
            }
        }

        const workers =
            [];

        for (
            let i = 0;
            i < CONCURRENCY;
            i++
        ) {

            workers.push(
                uploadNextPart()
            );
        }

        await Promise.all(
            workers
        );

        // ==================================================
        // 4. COMPLETE R2 UPLOAD
        // ==================================================

        uploadStatus.textContent =
            "Finishing upload...";

        completedParts.sort(
            (a, b) =>
                a.PartNumber -
                b.PartNumber
        );

        const completeResponse =
            await fetch(
                "/upload/complete",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            {
                                uploadId,
                                parts:
                                    completedParts
                            }
                        )
                }
            );

        const completeData =
            await readJsonResponse(
                completeResponse
            );

        if (
            !completeResponse.ok ||
            !completeData.success
        ) {

            throw new Error(
                completeData.error ||
                "Could not complete upload."
            );
        }

        // ==================================================
        // DONE
        // ==================================================

        currentUploadId =
            null;

        uploadStatus.textContent =
            "✅ Upload complete!";

        setMovie(
            completeData.movieUrl,
            completeData.movieName
        );

        video.currentTime =
            0;

        video.pause();

        console.log(
            "Movie uploaded successfully:",
            completeData.movieName
        );

    } catch (error) {

        console.error(
            "Movie upload error:",
            error
        );

        uploadStatus.textContent =
            "❌ Upload failed: " +
            error.message;

        alert(
            "Movie upload failed.\n\n" +
            error.message
        );

        // Try to cancel unfinished upload
        if (uploadId) {

            try {

                await fetch(
                    "/upload/abort",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(
                                {
                                    uploadId
                                }
                            )
                    }
                );

            } catch (
                abortError
            ) {

                console.error(
                    "Abort error:",
                    abortError
                );
            }
        }

        currentUploadId =
            null;

    } finally {

        uploadMovieBtn.disabled =
            false;

        movieInput.disabled =
            false;
    }
}

// ======================================================
// READ JSON SAFELY
// ======================================================

async function readJsonResponse(
    response
) {

    const text =
        await response.text();

    try {

        return JSON.parse(
            text
        );

    } catch (error) {

        console.error(
            "Server returned:",
            text
        );

        throw new Error(
            `Server returned ${response.status} instead of JSON.`
        );
    }
}

// ======================================================
// CHAT SEND
// ======================================================

sendMessageBtn.addEventListener(
    "click",
    sendMessage
);

messageInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key ===
            "Enter"
        ) {

            sendMessage();
        }
    }
);

function sendMessage() {

    const message =
        messageInput.value.trim();

    if (!message) {
        return;
    }

    socket.emit(
        "chat-message",
        message
    );

    messageInput.value =
        "";
}

// ======================================================
// CHAT RECEIVE
// ======================================================

socket.on(
    "chat-message",
    (data) => {

        const messageElement =
            document.createElement(
                "div"
            );

        messageElement.className =
            "message";

        const nameElement =
            document.createElement(
                "strong"
            );

        nameElement.textContent =
            data.name + ": ";

        const textElement =
            document.createElement(
                "span"
            );

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
    }
);

// ======================================================
// ROOM ERROR
// ======================================================

socket.on(
    "room-error",
    (message) => {

        alert(message);

        window.location.href =
            "/";
    }
);

// ======================================================
// SOCKET CONNECTION ERROR
// ======================================================

socket.on(
    "connect_error",
    (error) => {

        console.error(
            "Socket connection error:",
            error
        );
    }
);