# ⟳ SyncOrion

> Real-time collaborative watch & study platform — watch movies, study together, stay in sync.

---

## 📁 Project Structure

```
syncorion/
├── package.json            ← root (runs both server + client)
├── server/
│   ├── index.js            ← Express + Socket.io server
│   ├── package.json
│   └── .env                ← PORT, CLIENT_URL, ANTHROPIC_API_KEY
└── client/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js           ← Router
    │   ├── App.css          ← All styles
    │   ├── index.js         ← React entry
    │   ├── context/
    │   │   ├── SocketContext.js  ← Socket.io connection
    │   │   └── RoomContext.js    ← Room state (reducer)
    │   ├── pages/
    │   │   ├── Home.js      ← Create / Join room
    │   │   └── Room.js      ← Main room page
    │   └── components/
    │       ├── VideoPlayer.js    ← YouTube / Vimeo / HTML5
    │       ├── VideoUrlForm.js   ← Host loads a video
    │       ├── Chat.js           ← Real-time chat + AI assistant
    │       └── Participants.js   ← Participant list
    ├── package.json
    └── .env
```

---

## 🚀 Quick Start (Local)

### 1. Prerequisites
- Node.js v18+ — https://nodejs.org
- npm v9+

### 2. Clone / unzip the project
```bash
cd syncorion
```

### 3. Install all dependencies
```bash
npm run install:all
```

This runs `npm install` at root, then inside `server/` and `client/`.

### 4. Configure environment variables

**server/.env**
```
PORT=5000
CLIENT_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...      ← Get from console.anthropic.com
```

**client/.env**
```
REACT_APP_SERVER_URL=http://localhost:5000
```

### 5. Start both server & client
```bash
npm run dev
```

- React app → http://localhost:3000
- Socket.io server → http://localhost:5000

---

## 🧩 How It Works

### Room Flow
1. **Host** enters their name → clicks **Create Room** → gets a 6-character code
2. **Participants** enter their name + room code → click **Join Room**
3. Host pastes a YouTube / Vimeo / direct video URL → all participants see the video load
4. Host controls playback (play / pause / seek) → server broadcasts `sync-playback` event to all
5. Every 3 seconds the host sends a **heartbeat** with current time → server relays `drift-correction` to correct any participant drift
6. If host disconnects → **leader election** promotes the longest-present participant as new host

### Synchronization Algorithm
```
Host plays/pauses/seeks
    → socket.emit("playback-control", { action, time })
    → server updates room.videoState
    → io.to(room).emit("sync-playback", videoState)
    → all clients seek to time + match playing state

Host heartbeat every 3s
    → socket.emit("host-heartbeat", { time, playing })
    → server relays to all participants
    → if |participant.time - host.time| > 1.5s → seekTo(host.time)
```

### AI Chat Assistant
- Type `/ai <question>` in the chat
- Request goes to `POST /api/ai` on the server (keeps API key off the browser)
- Server calls Anthropic Claude API
- Answer is posted back into the chat as a special AI message

---

## 🔑 Key Socket Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | Client → Server | Join or create a room |
| `room-joined` | Server → Client | Full room state sent to joiner |
| `set-video` | Host → Server | Load a new video |
| `video-changed` | Server → All | New video URL broadcast |
| `playback-control` | Host → Server | Play / pause / seek |
| `sync-playback` | Server → All | Broadcast updated playback state |
| `host-heartbeat` | Host → Server | Periodic time sync |
| `drift-correction` | Server → Participants | Correct time drift |
| `chat-message` | Client ↔ Server ↔ All | Real-time chat |
| `participant-joined` | Server → All | New user joined |
| `participant-left` | Server → All | User disconnected |
| `host-changed` | Server → All | Leader election result |

---

## 🌐 Deployment Guide

### Option A — Render (Free Tier, Recommended)

**Deploy the server:**
1. Push your project to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Set:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `node index.js`
5. Add environment variables:
   - `CLIENT_URL` = your Vercel frontend URL (e.g. `https://syncorion.vercel.app`)
   - `ANTHROPIC_API_KEY` = your key

**Deploy the client:**
1. Go to https://vercel.com → New Project
2. Connect GitHub repo
3. Set:
   - Root directory: `client`
   - Build command: `npm run build`
   - Output directory: `build`
4. Add environment variable:
   - `REACT_APP_SERVER_URL` = your Render server URL (e.g. `https://syncorion-server.onrender.com`)

---

### Option B — Railway (Full-stack on one platform)
1. Create a new project at https://railway.app
2. Add two services: one for `server/`, one for `client/`
3. Set environment variables per service as above
4. Railway auto-assigns public URLs

---

### Option C — VPS (DigitalOcean / Hetzner)
```bash
# On your VPS
git clone <your-repo> syncorion && cd syncorion
npm run install:all

# Build React
cd client && npm run build && cd ..

# Serve client build with the Express server (add static serving in index.js)
# Install PM2
npm install -g pm2
cd server && pm2 start index.js --name syncorion
pm2 save && pm2 startup

# Use Nginx as reverse proxy on port 80 → 5000
```

---

## 🔒 Security Notes

- **Never expose `ANTHROPIC_API_KEY` in client-side code.** All AI calls are proxied through `/api/ai` on the server.
- The server uses CORS to restrict connections to `CLIENT_URL` only.
- Room codes are 6-character random alphanumeric strings — not guessable for private sessions, but you can add password protection as an enhancement.

---

## 🚧 Possible Enhancements
- Firebase Authentication for persistent user accounts
- Firestore to persist chat history and room data
- Screen share support (WebRTC)
- Emoji reactions synced in real-time
- Study timer / Pomodoro synced for the room
- Custom video upload (store on Cloudinary/S3)
- Password-protected rooms

---

## 📦 Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6 |
| Real-time | Socket.io (client + server) |
| Backend | Node.js, Express |
| Video | YouTube IFrame API, Vimeo API, HTML5 `<video>` |
| AI Chat | Anthropic Claude API (server-proxied) |
| Styling | Custom CSS (dark GitHub-inspired theme) |
| Deployment | Vercel (client) + Render (server) |
