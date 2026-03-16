import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useRoom } from "../context/RoomContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import VideoPlayer from "../components/VideoPlayer";
import Chat from "../components/Chat";
import Participants from "../components/Participants";
import VideoUrlForm from "../components/VideoUrlForm";

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { state, dispatch } = useRoom();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  // ── Save room metadata to Firestore when host creates the room ─────────────
  useEffect(() => {
    if (!state.isHost || !state.roomId || !user) return;
    setDoc(doc(db, "rooms", state.roomId), {
      roomId: state.roomId,
      hostId: user.uid,
      hostName: state.hostName,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      videoUrl: "",
    }, { merge: true }).catch(console.error);
  }, [state.isHost, state.roomId]);

  // ── Update room's lastActiveAt + video when host sets a video ──────────────
  useEffect(() => {
    if (!state.isHost || !state.roomId || !state.videoUrl) return;
    updateDoc(doc(db, "rooms", state.roomId), {
      videoUrl: state.videoUrl,
      lastActiveAt: serverTimestamp(),
    }).catch(console.error);
  }, [state.videoUrl]);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on("video-changed", (data) => dispatch({ type: "SET_VIDEO", payload: data }));
    socket.on("sync-playback", (data) => dispatch({ type: "SYNC_PLAYBACK", payload: data }));
    socket.on("drift-correction", (data) => dispatch({ type: "SYNC_PLAYBACK", payload: data }));
    socket.on("participant-joined", ({ participants }) => dispatch({ type: "UPDATE_PARTICIPANTS", payload: participants }));
    socket.on("participant-left", ({ name, participants }) => {
      dispatch({ type: "UPDATE_PARTICIPANTS", payload: participants });
      dispatch({ type: "ADD_MESSAGE", payload: { id: Date.now(), system: true, text: `${name} left the room`, timestamp: Date.now() } });
    });
    socket.on("host-changed", (data) => {
      dispatch({ type: "HOST_CHANGED", payload: data });
      dispatch({ type: "ADD_MESSAGE", payload: { id: Date.now(), system: true, text: `${data.newHostName} is now the host`, timestamp: Date.now() } });
    });
    socket.on("chat-message", (msg) => dispatch({ type: "ADD_MESSAGE", payload: msg }));

    return () => {
      socket.off("video-changed");
      socket.off("sync-playback");
      socket.off("drift-correction");
      socket.off("participant-joined");
      socket.off("participant-left");
      socket.off("host-changed");
      socket.off("chat-message");
    };
  }, [socket, dispatch]);

  useEffect(() => {
    if (!state.connected) navigate("/");
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    dispatch({ type: "LEAVE_ROOM" });
    navigate("/");
  };

  return (
    <div className="room-container">
      <header className="room-header">
        <div className="room-header-left">
          <span className="logo-small">⟳ SyncOrion</span>
          <span className="room-badge">{roomId}</span>
          {state.isHost && <span className="host-badge">HOST</span>}
        </div>
        <div className="room-header-right">
          <button className="icon-btn" onClick={() => setShowParticipants((p) => !p)} title="Participants">
            👥 {state.participants.length}
          </button>
          <button className="icon-btn" onClick={copyLink} title="Copy link">
            {copied ? "✅ Copied!" : "🔗 Share"}
          </button>
          <button className="icon-btn danger" onClick={leaveRoom}>✕ Leave</button>
        </div>
      </header>

      <div className="room-body">
        <div className="room-main">
          {state.isHost && <VideoUrlForm />}
          <VideoPlayer />
        </div>
        <div className="room-sidebar">
          {showParticipants
            ? <Participants onClose={() => setShowParticipants(false)} />
            : <Chat />
          }
        </div>
      </div>
    </div>
  );
}
