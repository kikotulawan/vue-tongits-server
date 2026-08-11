# Tongits Multiplayer Backend

Real-time multiplayer backend for a **Tongits** card game built with **Node.js, Express, and Socket.IO**.

The server manages game rooms, player connections, card distribution, turns, drawing, discarding, melding, and other real-time game events through WebSocket communication.

> **Note:** Game data is currently stored **in memory only**. Restarting the server will remove all active rooms and game sessions.

---

## Features

- 🎴 Real-time multiplayer Tongits gameplay
- 👥 Multiplayer game rooms
- 🔗 Room creation and joining
- ⚡ Real-time communication using Socket.IO
- 🃏 Server-side card/deck management
- 🎯 Turn management
- 📥 Draw card functionality
- 📤 Discard card functionality
- 🧩 Meld support
- 👀 Players can see shared table information
- 🔄 Automatic player state synchronization
- 🌐 Supports local network and internet-hosted games
- 💾 In-memory game state
- 🚀 Lightweight Node.js backend

---

## Technology Stack

| Technology      | Purpose                             |
| --------------- | ----------------------------------- |
| Node.js         | JavaScript runtime                  |
| Express         | HTTP server                         |
| Socket.IO       | Real-time multiplayer communication |
| JavaScript      | Backend implementation              |
| In-Memory State | Room and game storage               |

---

## Project Structure

```text
backend/
├── server.js
├── package.json
├── package-lock.json
└── README.md
```

---

# Installation

## 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
```

Navigate into the backend directory:

```bash
cd backend
```

---

## 2. Install dependencies

```bash
npm install
```

---

# Running the Server

Start the server using:

```bash
node server.js
```

For development, you can use:

```bash
node --watch server.js
```

If your project uses Nodemon:

```bash
npx nodemon server.js
```

The server should start on the configured port.

For example:

```text
Server running on http://localhost:3000
```

---

# Connecting the Frontend

The Vue frontend connects to the backend using Socket.IO.

Example:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
```

For a production/internet server:

```javascript
const socket = io("https://your-domain.com");
```

---

# Local Network Multiplayer

The backend can be hosted on a computer within the same local network.

For example:

```text
Computer running backend
        │
        ├── Wi-Fi / LAN
        │
        ├── Player 1
        ├── Player 2
        └── Player 3
```

Instead of connecting to:

```text
localhost
```

other devices should connect using the server computer's local IP address.

Example:

```javascript
const socket = io("http://192.168.1.100:3000");
```

Replace `192.168.1.100` with the actual IP address of the computer running the server.

---

# Internet Multiplayer

For internet-based games, the backend must be accessible from the internet.

The frontend connects to the public backend URL:

```javascript
const socket = io("https://your-domain.com");
```

The backend server must allow incoming connections to the configured HTTP/HTTPS port.

For production deployments, HTTPS/WSS is recommended.

---

# Game Architecture

The server acts as the authoritative game server.

```text
                ┌─────────────────────┐
                │     Node.js Server  │
                │                     │
                │ Express + Socket.IO │
                └──────────┬──────────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
         Player 1      Player 2      Player 3
          Browser       Browser       Browser
```

Players communicate with the server through Socket.IO.

The server maintains the current game state and broadcasts changes to the players in the room.

---

# Rooms

Each game is associated with a room.

A typical game flow is:

```text
Create Room
    │
    ▼
Room Created
    │
    ▼
Players Join
    │
    ▼
Game Starts
    │
    ▼
Players Take Turns
    │
    ├── Draw
    │
    ├── Meld
    │
    └── Discard
    │
    ▼
Game Continues
    │
    ▼
Game Ends
```

Room state exists only while the Node.js server is running.

---

# In-Memory Storage

The current backend intentionally uses memory instead of a database.

Conceptually, the server maintains data similar to:

```javascript
const rooms = new Map();
```

Each room contains information about the current game, including players and game state.

Example conceptual structure:

```javascript
{
    roomId: 'ABC123',

    players: [
        {
            id: 'socket-id-1',
            name: 'Player 1'
        },
        {
            id: 'socket-id-2',
            name: 'Player 2'
        }
    ],

    gameState: {
        deck: [],
        discardPile: [],
        meldedPiles: [],
        currentPlayer: null
    }
}
```

The exact structure depends on the implementation in `server.js`.

---

# Important: Data Persistence

Because the backend uses in-memory storage:

```text
Server running
     │
     ├── Room A
     ├── Room B
     └── Room C

Server restarted
     │
     ▼
All rooms are removed
```

There is currently no persistent database.

This means:

- Restarting the server removes all rooms.
- Server crashes remove active games.
- Deploying a new version removes active games.
- Multiple backend instances cannot automatically share game state.

This is suitable for an early-stage multiplayer game where persistent game storage is not required.

---

# Socket.IO Communication

The frontend and backend communicate using Socket.IO events.

The exact event names should match the implementation in `server.js`.

Typical multiplayer events include:

```text
create-room
join-room
start-game
draw-card
discard-card
meld
leave-room
```

The server then broadcasts updated game state to players in the room.

For example:

```javascript
socket.to(roomId).emit("game-state", gameState);
```

---

# Server-Authoritative Game State

Game-critical operations should be handled by the backend.

The client should not be trusted to determine:

- Which card is drawn
- Which card is discarded
- Whose turn it is
- Whether a move is valid
- The contents of the deck
- The current game state
- Player scores

The frontend should primarily display the state received from the server.

```text
Frontend
   │
   │  Request action
   ▼
Backend
   │
   ├── Validate action
   ├── Update game state
   └── Broadcast result
   │
   ▼
All players
```

This prevents players from easily manipulating their local game state.

---

# Example Client Connection

Vue 3 example:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
	console.log("Connected:", socket.id);
});

socket.on("game-state", (state) => {
	console.log("Updated game state:", state);
});
```

---

# Example Room Creation

A client can request a new room through Socket.IO:

```javascript
socket.emit("create-room", {
	playerName: "Player 1",
});
```

The server creates the room and returns the room information to the client.

---

# Example Joining a Room

```javascript
socket.emit("join-room", {
	roomId: "ABC123",
	playerName: "Player 2",
});
```

After joining, the server synchronizes the current room/game state with the connected players.

---

# Game State Synchronization

Whenever the game state changes, the backend should synchronize the updated state with the players in the room.

For example:

```javascript
io.to(roomId).emit("game-state", gameState);
```

This allows all players to see changes such as:

- New cards
- Discarded cards
- Melded cards
- Current player
- Player actions
- Game status
- Scores

---

# Error Handling

Client-side errors should be handled through Socket.IO events.

Example:

```javascript
socket.on("error-message", (message) => {
	console.error(message);
});
```

The frontend can then display the error to the player.

For example:

```text
Cannot discard this card.
It is not your turn.
```

---

# Development

Start the backend:

```bash
node server.js
```

Then start the Vue frontend separately.

For example:

```bash
npm run dev
```

The development setup will typically look like:

```text
Vue 3
localhost:5173
     │
     │ Socket.IO
     ▼
Node.js + Express
localhost:3000
```

---

# CORS

When the Vue frontend and Node.js backend run on different ports or domains, the backend must allow the frontend origin.

Example:

```javascript
const io = new Server(server, {
	cors: {
		origin: "*",
	},
});
```

For production, it is recommended to restrict this to your actual frontend domain instead of using:

```javascript
origin: "*";
```

For example:

```javascript
const io = new Server(server, {
	cors: {
		origin: "https://your-frontend-domain.com",
	},
});
```

---

# Production Deployment

The backend can be deployed to a Node.js-compatible hosting environment.

The deployment should provide:

- Node.js
- HTTP/HTTPS access
- WebSocket/Socket.IO support
- A publicly accessible port/domain

Example architecture:

```text
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │   Vue Frontend  │
              └────────┬────────┘
                       │
                   Socket.IO
                       │
                       ▼
              ┌─────────────────┐
              │ Node.js Backend │
              │ Express         │
              │ Socket.IO       │
              └─────────────────┘
                       │
                       ▼
                 In-Memory State
```

---

# Environment Configuration

If the backend uses environment variables, create a `.env` file:

```env
PORT=3000
```

Do not commit sensitive environment variables to GitHub.

Add `.env` to `.gitignore`:

```gitignore
node_modules/
.env
```

---

# Security Considerations

Before deploying publicly, consider implementing:

- CORS restrictions
- Input validation
- Rate limiting
- Room ID validation
- Player name validation
- Maximum room capacity
- Server-side move validation
- Socket connection limits
- HTTPS
- Authentication, if required
- Protection against malicious Socket.IO clients

Never rely exclusively on frontend validation for game rules.

---

# Current Limitations

The current backend has some intentional limitations.

### In-memory game state

All games are stored in server memory.

A server restart will terminate active games.

### Single server instance

The current architecture is designed for a single Node.js server instance.

Running multiple backend instances requires shared state or a Socket.IO adapter such as Redis.

### No persistent accounts

The current backend does not require a database for player accounts.

### No game history

Completed games are not permanently stored.

---

# Future Improvements

Possible future enhancements include:

- Redis-based shared game state
- Persistent game history
- Player accounts
- Authentication
- Matchmaking
- Private/public rooms
- Spectator mode
- Reconnection support
- Player statistics
- Leaderboards
- Game history
- Anti-cheat validation
- Server-side logging
- Automatic room cleanup
- Multiple Node.js server instances
- HTTPS/WSS
- Docker deployment

---

# Recommended Production Architecture

For a larger deployment, the architecture can be expanded to:

```text
                     Internet
                         │
                         ▼
                  Load Balancer
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       Node.js Server 1        Node.js Server 2
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
                       Redis
                         │
                         ▼
                     Database
```

Redis can be used for shared Socket.IO communication and temporary game state, while a database can be introduced for persistent player and game information.

---

# License

Add your preferred license here.

Example:

```text
MIT License
```

---

# Author

Developed as the backend service for a real-time multiplayer **Tongits** game.

**Backend:** Node.js + Express + Socket.IO
**Game State:** In-memory
**Frontend:** Vue 3
