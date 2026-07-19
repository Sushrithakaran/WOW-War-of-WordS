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

function generateSharedWords() {
    const list = [];
    for(let i=0; i<100; i++) {
        list.push(wordList[Math.floor(Math.random() * wordList.length)]);
    }
    return list;
}

io.on('connection', (socket) => {
    console.log(`User Linked: ${socket.id}`);

    socket.on('join_game', (data) => {
        const playerColor = data.color || "#33aaff";
        const customRoomName = data.roomName ? data.roomName.trim().toLowerCase() : "";

        // PRIVATE ROOM MATCHING
        if (customRoomName !== "") {
            const roomId = `private_${customRoomName}`;
            socket.join(roomId);

            // Safer cross-version method to get active room counts
            const roomObj = io.sockets.adapter.rooms.get(roomId);
            const numClients = roomObj ? roomObj.size : 0;
            
            if (numClients === 1) {
                socket.emit('status', `ROOM CREATED! SHARE CODE: "${customRoomName.toUpperCase()}" WITH A FRIEND`);
            } else if (numClients === 2) {
                let firstPlayerId = null;
                for (const clientId of roomObj) {
                    if (clientId !== socket.id) { firstPlayerId = clientId; break; }
                }
                
                const sharedWords = generateSharedWords();
                io.to(firstPlayerId).emit('match_found', { roomId, role: 'p1', words: sharedWords, oppColor: playerColor });
                socket.emit('match_found', { roomId, role: 'p2', words: sharedWords, oppColor: "#ffaa33" });
                
                // Let player 1 know player 2's custom color choice
                io.to(firstPlayerId).emit('update_opponent_color', { color: playerColor });
            } else {
                socket.leave(roomId);
                socket.emit('status', 'ROOM FULL! CHOOSE A DIFFERENT CODE.');
            }
            return;
        }

        // PUBLIC MATCHMAKING
        if (!publicWaitingPlayer) {
            publicWaitingPlayer = { socket, color: playerColor };
            socket.emit('status', 'SEARCHING FOR A MATCH... ENJOY PRACTICE MODE!');
        } else {
            const opponent = publicWaitingPlayer;
            publicWaitingPlayer = null;
            
            const roomId = `public_${Date.now()}`;
            socket.join(roomId);
            opponent.socket.join(roomId);

            const sharedWords = generateSharedWords();
            opponent.socket.emit('match_found', { roomId, role: 'p1', words: sharedWords, oppColor: playerColor });
            socket.emit('match_found', { roomId, role: 'p2', words: sharedWords, oppColor: opponent.color });
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
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Active server hosting on Port: ${PORT}`));
