import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useRoom } from "../context/RoomContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  limit,
} from "firebase/firestore";

export default function Home() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { dispatch } = useRoom();
  const { user, logout } = useAuth();

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("create");
  const [pastRooms, setPastRooms] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const name = user?.displayName || user?.email?.split("@")[0] || "User";

  // ── Load past sessions from Firestore ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, "sessions"),
          where("userId", "==", user.uid),
          orderBy("joinedAt", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        setPastRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load history:", e);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [user]);

  // ── Save session to Firestore ──────────────────────────────────────────────
  const saveSession = async (roomId, isHost) => {
    try {
      await addDoc(collection(db, "sessions"), {
        userId: user.uid,
        userName: name,
        userPhoto: user.photoURL || "",
        roomId,
        isHost,
        joinedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  };

  const joinRoom = (roomId, roomData, isHost) => {
    dispatch({ type: "SET_MY_SOCKET_ID", payload: socket.id });
    dispatch({
      type: "JOIN_ROOM",
      payload: {
        roomId: roomData.roomId,
        myName: name,
        isHost,
        hostId: isHost ? socket.id : roomData.hostId,
        hostName: roomData.hostName || name,
        participants: roomData.participants,
        videoUrl: roomData.videoUrl,
        videoType: roomData.videoType,
        videoState: roomData.videoState,
      },
    });
    saveSession(roomId, isHost);
    navigate(`/room/${roomId}`);
  };

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      socket.emit("join-room", { roomId: data.roomId, name, isHost: true });
      socket.once("room-joined", (roomData) => joinRoom(data.roomId, roomData, true));
    } catch (e) {
      setError(e.message || "Failed to create room");
      setLoading(false);
    }
  };

  const handleJoin = (code) => {
    const rid = (code || roomCode).trim().toUpperCase();
    if (!rid) return setError("Please enter a room code");
    setError("");
    setLoading(true);

    socket.emit("join-room", { roomId: rid, name, isHost: false });
    socket.once("room-joined", (roomData) => joinRoom(rid, roomData, roomData.isHost));
    socket.once("error", (err) => { setError(err.message); setLoading(false); });
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="home-container" style={{ overflowY: "auto", alignItems: "flex-start", paddingTop: 40 }}>
      <div className="home-card" style={{ maxWidth: 460 }}>
        {/* Logo */}
        <div className="logo">
          <span className="logo-icon">⟳</span>
          <h1>SyncOrion</h1>
        </div>
        <p className="tagline">Watch together. Study together. Stay in sync.</p>

        {/* User bar */}
        <div className="user-bar">
          <img
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1f6feb&color=fff`}
            alt={name}
            className="user-avatar"
          />
          <span className="user-name">{name}</span>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Create Room</button>
          <button className={tab === "join" ? "active" : ""} onClick={() => setTab("join")}>Join Room</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
        </div>

        {/* Create */}
        {tab === "create" && (
          <div className="form">
            {error && <p className="error">{error}</p>}
            <button className="primary-btn" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "🚀 Create Room"}
            </button>
          </div>
        )}

        {/* Join */}
        {tab === "join" && (
          <div className="form">
            <input
              placeholder="6-character room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="room-code-input"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            {error && <p className="error">{error}</p>}
            <button className="primary-btn" onClick={() => handleJoin()} disabled={loading}>
              {loading ? "Joining…" : "→ Join Room"}
            </button>
          </div>
        )}

        {/* History */}
        {tab === "history" && (
          <div className="history-list">
            {loadingHistory ? (
              <p className="empty-chat">Loading history…</p>
            ) : pastRooms.length === 0 ? (
              <p className="empty-chat">No past sessions yet.</p>
            ) : (
              pastRooms.map((session) => (
                <div key={session.id} className="history-item">
                  <div className="history-info">
                    <span className="history-room">{session.roomId}</span>
                    {session.isHost && <span className="host-badge small">HOST</span>}
                    <span className="history-time">{formatTime(session.joinedAt)}</span>
                  </div>
                  <button
                    className="rejoin-btn"
                    onClick={() => handleJoin(session.roomId)}
                    disabled={loading}
                  >
                    Rejoin
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <p className="footer-note">Supports YouTube, Vimeo & direct video links</p>
      </div>
    </div>
  );
}
