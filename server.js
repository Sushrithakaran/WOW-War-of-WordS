const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin requests so external frontends can connect natively
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Serve static frontend files if hosted together
app.use(express.static(path.join(__dirname, './')));

let waitingPlayer = null;
const wordList = ["SWORD", "SLASH", "ATTACK", "STRIKE", "WARRIOR", "FIGHT", "BLADE", "NINJA", "COMBO", "DASH", "RUSH", "HERO", "STEEL", "SHADOW"];

io.on('connection', (socket) => {
    console.log(`User Linked: ${socket.id}`);

    // Random Matchmaker Logic
    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit('status', 'WAITING FOR OPPONENT...');
    } else {
        const opponent = waitingPlayer;
        waitingPlayer = null;
        
        // Form an isolated network room instance
        const roomId = `room_${Date.now()}`;
        socket.join(roomId);
        opponent.join(roomId);

        // Pre-generate shared uniform words for both tracks
        const sharedWords = [];
        for(let i=0; i<50; i++) {
            sharedWords.push(wordList[Math.floor(Math.random() * wordList.length)]);
        }

        // Initialize players on opposite lanes
        opponent.emit('match_found', { roomId, role: 'p1', opponentId: socket.id, words: sharedWords });
        socket.emit('match_found', { roomId, role: 'p2', opponentId: opponent.id, words: sharedWords });
    }

    // Forward real-time action strokes across client groups
    socket.on('player_action', (data) => {
        socket.to(data.roomId).emit('opponent_action', data);
    });

    // Handle Game Over transmission updates
    socket.on('game_over_claim', (data) => {
        io.to(data.roomId).emit('match_ended', data);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        console.log(`User Disconnected: ${socket.id}`);
    });
});

// Dynamic fallback assignment port binding
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Active server hosting on Port: ${PORT}`));
