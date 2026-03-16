require("dotenv").config();
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
  pingInterval: 5000,
  pingTimeout: 10000,
});

// ─── In-Memory Room Store ────────────────────────────────────────────────────
const rooms = new Map();
// Room structure:
// {
//   id, hostId, hostName, videoUrl, videoType, videoState,
//   participants: Map<socketId, { name, joinedAt, isHost }>
// }

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getRoomPublic(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    hostName: room.hostName,
    videoUrl: room.videoUrl,
    videoType: room.videoType,
    videoState: room.videoState,
    participantCount: room.participants.size,
    participants: Array.from(room.participants.entries()).map(([sid, p]) => ({
      socketId: sid,
      name: p.name,
      isHost: p.isHost,
    })),
  };
}

// ─── Leader Election ──────────────────────────────────────────────────────────
// If host disconnects, elect the oldest remaining participant as new host
function electNewHost(room) {
  const sorted = Array.from(room.participants.entries()).sort(
    (a, b) => a[1].joinedAt - b[1].joinedAt
  );
  if (sorted.length === 0) return null;
  const [newHostSocketId, newHostData] = sorted[0];
  room.hostId = newHostSocketId;
  room.hostName = newHostData.name;
  newHostData.isHost = true;
  return newHostSocketId;
}

// ─── REST Endpoints ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/rooms", (req, res) => {
  const { hostName } = req.body;
  if (!hostName) return res.status(400).json({ error: "hostName required" });

  const roomId = generateRoomCode();
  rooms.set(roomId, {
    id: roomId,
    hostId: null, // set when socket connects
    hostName,
    videoUrl: "",
    videoType: "youtube",
    videoState: { playing: false, time: 0, updatedAt: Date.now() },
    participants: new Map(),
  });

  res.json({ roomId });
});

// AI Debug Route - visit http://localhost:5000/api/ai/test in browser
app.get("/api/ai/test", (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ status: "FAIL: ANTHROPIC_API_KEY is NOT set" });
  if (key === "your_anthropic_api_key_here") return res.json({ status: "FAIL: Key is still the placeholder" });
  res.json({ status: "OK: Key is loaded", preview: key.substring(0, 15) + "..." });
});

// AI Proxy - uses built-in https module (works on all Node.js versions)
app.post("/api/ai", (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey || apiKey === "your_anthropic_api_key_here") {
    return res.json({ answer: "AI assistant is not configured. Add ANTHROPIC_API_KEY to server/.env and restart the server." });
  }

  const payload = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: "You are a helpful AI study assistant inside SyncOrion. Be concise and helpful. Keep answers under 150 words.",
    messages: [{ role: "user", content: question }],
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => (data += chunk));
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          console.error("[AI] Anthropic error:", parsed.error);
          return res.json({ answer: "AI error: " + parsed.error.message });
        }
        const answer = parsed.content?.[0]?.text || "No response from AI.";
        res.json({ answer });
      } catch (e) {
        console.error("[AI] Parse error:", e.message, "Raw:", data.substring(0, 200));
        res.status(500).json({ answer: "Failed to parse AI response." });
      }
    });
  });

  apiReq.on("error", (e) => {
    console.error("[AI] Request error:", e.message);
    res.status(500).json({ answer: "AI request failed: " + e.message });
  });

  apiReq.write(payload);
  apiReq.end();
});

app.get("/api/rooms/:roomId", (req, res) => {
  const room = getRoom(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(getRoomPublic(room));
});

// ─── Socket.io Logic ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on("join-room", ({ roomId, name, isHost }) => {
    const rid = roomId.toUpperCase();
    let room = getRoom(rid);

    if (!room) {
      // Auto-create if host is joining fresh
      if (isHost) {
        rooms.set(rid, {
          id: rid,
          hostId: socket.id,
          hostName: name,
          videoUrl: "",
          videoType: "youtube",
          videoState: { playing: false, time: 0, updatedAt: Date.now() },
          participants: new Map(),
        });
        room = getRoom(rid);
      } else {
        socket.emit("error", { message: "Room not found" });
        return;
      }
    }

    socket.join(rid);
    const participant = { name, joinedAt: Date.now(), isHost: isHost || room.hostId === socket.id };
    room.participants.set(socket.id, participant);

    // If first to join or explicitly host, set as host
    if (isHost || room.participants.size === 1) {
      room.hostId = socket.id;
      room.hostName = name;
      participant.isHost = true;
    }

    socket.data.roomId = rid;
    socket.data.name = name;

    // Send current room state to the joining user
    socket.emit("room-joined", {
      roomId: rid,
      isHost: participant.isHost,
      videoUrl: room.videoUrl,
      videoType: room.videoType,
      videoState: room.videoState,
      participants: getRoomPublic(room).participants,
      hostId: room.hostId,
    });

    // Notify others
    socket.to(rid).emit("participant-joined", {
      socketId: socket.id,
      name,
      participants: getRoomPublic(room).participants,
    });

    console.log(`[Room ${rid}] ${name} joined (${room.participants.size} total)`);
  });

  // ── set-video ──────────────────────────────────────────────────────────────
  socket.on("set-video", ({ videoUrl, videoType }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.videoUrl = videoUrl;
    room.videoType = videoType || detectVideoType(videoUrl);
    room.videoState = { playing: false, time: 0, updatedAt: Date.now() };

    io.to(socket.data.roomId).emit("video-changed", {
      videoUrl: room.videoUrl,
      videoType: room.videoType,
      videoState: room.videoState,
    });
  });

  // ── playback-control ───────────────────────────────────────────────────────
  // Only host can send; server broadcasts to all including sender
  socket.on("playback-control", ({ action, time }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.videoState = {
      playing: action === "play",
      time: time ?? room.videoState.time,
      updatedAt: Date.now(),
    };

    io.to(socket.data.roomId).emit("sync-playback", {
      ...room.videoState,
      action,
    });
  });

  // ── heartbeat sync (drift correction) ─────────────────────────────────────
  // Host periodically sends current time; server relays to participants
  socket.on("host-heartbeat", ({ time, playing }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.videoState.time = time;
    room.videoState.playing = playing;
    room.videoState.updatedAt = Date.now();

    socket.to(socket.data.roomId).emit("drift-correction", { time, playing });
  });

  // ── chat-message ───────────────────────────────────────────────────────────
  socket.on("chat-message", ({ text }) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    const message = {
      id: uuidv4(),
      senderId: socket.id,
      senderName: participant?.name || "Unknown",
      text,
      timestamp: Date.now(),
      isHost: room.hostId === socket.id,
    };

    io.to(socket.data.roomId).emit("chat-message", message);
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const rid = socket.data.roomId;
    if (!rid) return;

    const room = getRoom(rid);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    room.participants.delete(socket.id);

    if (room.participants.size === 0) {
      rooms.delete(rid);
      console.log(`[Room ${rid}] Empty — deleted`);
      return;
    }

    let newHostSocketId = null;
    if (room.hostId === socket.id) {
      newHostSocketId = electNewHost(room);
      io.to(rid).emit("host-changed", {
        newHostId: newHostSocketId,
        newHostName: room.hostName,
      });
    }

    io.to(rid).emit("participant-left", {
      socketId: socket.id,
      name: participant?.name || "Unknown",
      participants: getRoomPublic(room).participants,
    });

    console.log(`[Room ${rid}] ${participant?.name} left (${room.participants.size} remaining)`);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectVideoType(url) {
  if (!url) return "youtube";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  return "custom";
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`SyncOrion server running on port ${PORT}`));
