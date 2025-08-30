// Elements
const localVideo = document.getElementById('localVideo');
const videosDiv = document.getElementById('videos');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const screenBtn = document.getElementById('screenBtn');
const handBtn = document.getElementById('handBtn');

// User & room
const username = prompt("Enter your name:") || "Me";
const userId = Math.floor(Math.random()*1000000);
const room = prompt("Enter room name:");

// Local stream and peers
let localStream;
let peers = {}; // peerId -> { peer, username }

// Connect to signaling server
const ws = new ReconnectingWebSocket('wss://signaling.simplewebrtc.com');
ws.addEventListener('open', () => ws.send(JSON.stringify({ type:'join', room, userId, username })));

// Handle incoming signaling messages
ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if(data.userId === userId) return;

    if(data.type === 'signal'){
        if(!peers[data.userId]) peers[data.userId] = { peer: createPeer(false, data.userId, data.username), username: data.username };
        peers[data.userId].peer.signal(data.signal);
    }

    if(data.type === 'new-user'){
        if(!peers[data.userId]) peers[data.userId] = { peer: createPeer(true, data.userId, data.username), username: data.username };
    }

    if(data.type === 'user-left') removePeer(data.userId);
});

// Get camera/microphone
navigator.mediaDevices.getUserMedia({ video:true, audio:true })
.then(stream => { localVideo.srcObject = stream; localStream = stream; })
.catch(console.error);

// Create peer connection
function createPeer(initiator, peerId, peerName){
    const peer = new SimplePeer({ initiator, trickle:false, stream: localStream, config:{ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] } });

    peer.on('signal', signal => ws.send(JSON.stringify({ type:'signal', room, userId, username, signal, peerId })));
    peer.on('stream', stream => addVideo(peerId, stream, peerName));
    peer.on('data', data => handleData(data, peerName));
    peer.on('close', () => removePeer(peerId));
    peer.on('error', () => removePeer(peerId));

    return peer;
}

// Add remote video
function addVideo(peerId, stream, peerName){
    if(document.getElementById('remote_' + peerId)) return;

    const container = document.createElement('div');
    container.className = 'video-card';

    const video = document.createElement('video');
    video.id = 'remote_' + peerId;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'label';
    label.id = 'label_' + peerId;
    label.textContent = peerName;

    container.appendChild(video);
    container.appendChild(label);
    videosDiv.appendChild(container);
    updateGrid();
}

// Remove peer
function removePeer(peerId){
    if(peers[peerId]) peers[peerId].peer.destroy();
    delete peers[peerId];

    const video = document.getElementById('remote_' + peerId);
    if(video) video.parentElement.remove();

    updateGrid();
}

// Update video grid
function updateGrid(){
    const total = videosDiv.querySelectorAll('.video-card').length;
    const cols = total > 0 ? Math.ceil(Math.sqrt(total)) : 1;
    videosDiv.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

// Chat functions
function addMessage(msg){
    const p = document.createElement('p');
    p.textContent = msg;
    messages.appendChild(p);
    messages.scrollTop = messages.scrollHeight;
}

sendBtn.onclick = () => {
    const msg = messageInput.value;
    if(msg){
        addMessage(`Me: ${msg}`);
        Object.values(peers).forEach(p => p.peer.send(msg));
        messageInput.value = '';
    }
};

// Mute/unmute audio
muteBtn.onclick = () => {
    localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
    muteBtn.textContent = localStream.getAudioTracks()[0].enabled ? "Mute" : "Unmute";
};

// Start/stop video
videoBtn.onclick = () => {
    localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
    videoBtn.textContent = localStream.getVideoTracks()[0].enabled ? "Stop Video" : "Start Video";
};

// Screen sharing
screenBtn.onclick = async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video:true });
        Object.values(peers).forEach(p => screenStream.getTracks().forEach(track => p.peer.replaceTrack(localStream.getVideoTracks()[0], track, localStream)));

        screenStream.getVideoTracks()[0].onended = () => {
            Object.values(peers).forEach(p => p.peer.replaceTrack(screenStream.getVideoTracks()[0], localStream.getVideoTracks()[0], localStream));
        };
    } catch(e){ console.error(e); }
};

// Raise hand
handBtn.onclick = () => {
    const card = localVideo.parentElement;
    const hand = document.createElement('div');
    hand.className = 'hand';
    hand.textContent = '✋';
    card.appendChild(hand);
    setTimeout(() => hand.remove(), 2000);

    Object.values(peers).forEach(p => p.peer.send(JSON.stringify({ type:'hand' })));
};

// Handle incoming data
function handleData(data, peerName){
    try {
        const obj = JSON.parse(data);

        if(obj.type === 'hand'){
            const card = document.getElementById('remote_' + peerName)?.parentElement;
            if(card){
                const hand = document.createElement('div');
                hand.className = 'hand';
                hand.textContent = '✋';
                card.appendChild(hand);
                setTimeout(() => hand.remove(), 2000);
            }
        }

        if(obj.type === 'emoji'){
            const card = document.getElementById('remote_' + peerName)?.parentElement;
            if(card){
                const e = document.createElement('div');
                e.className = 'emoji';
                e.textContent = obj.emoji;
                card.appendChild(e);
                setTimeout(() => e.remove(), 1000);
            }
        }
    } catch(e){
        addMessage(`${peerName}: ${data}`);
    }
}

// Notify leaving
window.addEventListener('beforeunload', () => ws.send(JSON.stringify({ type:'user-left', room, userId })));
