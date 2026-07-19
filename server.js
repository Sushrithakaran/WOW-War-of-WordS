const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, './')));

let publicWaitingPlayer = null;
const wordList = ["SWORD", "SLASH", "ATTACK", "STRIKE", "WARRIOR", "FIGHT", "BLADE", "NINJA", "COMBO", "DASH", "RUSH", "HERO", "STEEL", "SHADOW"];

// Helper to generate uniform text tracks
function generateSharedWords() {
    const list = [];
    for(let i=0; i<100; i++) {
        list.push(wordList[Math.floor(Math.random() * wordList.length)]);
    }
    return list;
}

io.on('connection', (socket) => {
    console.log(`User Linked: ${socket.id}`);

    // Action handler for joining public or private arenas
    socket.on('join_game', (data) => {
        const playerColor = data.color || "#33aaff";
        const customRoomName = data.roomName ? data.roomName.trim().toLowerCase() : "";

        // CASE 1: Private Room Logic
        if (customRoomName !== "") {
            const roomId = `private_${customRoomName}`;
            socket.join(roomId);

            // Fetch active sockets inside that room namespace
            const clients = io.sockets.adapter.rooms.get(roomId);
            
            if (clients && clients.size === 1) {
                // First player in private lobby: put them in solo/waiting state
                socket.emit('status', `WAITING FOR FRIEND IN ROOM: ${customRoomName.toUpperCase()}...`);
            } else if (clients && clients.size === 2) {
                // Second player arrives: find the first player's ID
                let firstPlayerId = null;
                for (const clientId of clients) {
                    if (clientId !== socket.id) { firstPlayerId = clientId; break; }
                }
                
                const sharedWords = generateSharedWords();
                // Match players up immediately
                io.to(firstPlayerId).emit('match_found', { roomId, role: 'p1', opponentId: socket.id, words: sharedWords, oppColor: playerColor });
                socket.emit('match_found', { roomId, role: 'p2', opponentId: firstPlayerId, words: sharedWords, oppColor: data.oppColorPrev || "#ffaa33" });
                
                // Inform first player of second player's color
                io.to(firstPlayerId).emit('update_opponent_color', { color: playerColor });
            } else {
                // Room full failsafe fallback
                socket.leave(roomId);
                socket.emit('status', 'ROOM IS FULL! CHOOSE ANOTHER NAME.');
            }
            return;
        }

        // CASE 2: Public Random Queue Matchmaker Logic
        if (!publicWaitingPlayer) {
            publicWaitingPlayer = { socket, color: playerColor };
            socket.emit('status', 'WAITING FOR PUBLIC OPPONENT...');
        } else {
            const opponent = publicWaitingPlayer;
            publicWaitingPlayer = null;
            
            const roomId = `public_${Date.now()}`;
            socket.join(roomId);
            opponent.socket.join(roomId);

            const sharedWords = generateSharedWords();
            opponent.socket.emit('match_found', { roomId, role: 'p1', opponentId: socket.id, words: sharedWords, oppColor: playerColor });
            socket.emit('match_found', { roomId, role: 'p2', opponentId: opponent.socket.id, words: sharedWords, oppColor: opponent.color });
        }
    });

    socket.on('player_action', (data) => {
        socket.to(data.roomId).emit('opponent_action', data);
    });

    socket.on('game_over_claim', (data) => {
        io.to(data.roomId).emit('match_ended', data);
    });

    socket.on('disconnect', () => {
        if (publicWaitingPlayer && publicWaitingPlayer.socket.id === socket.id) publicWaitingPlayer = null;
        console.log(`User Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Active server hosting on Port: ${PORT}`));
