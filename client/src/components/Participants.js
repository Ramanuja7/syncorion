import React from "react";
import { useRoom } from "../context/RoomContext";

export default function Participants({ onClose }) {
  const { state } = useRoom();

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span>👥 Participants ({state.participants.length})</span>
        <button className="close-btn" onClick={onClose}>← Chat</button>
      </div>
      <div className="participants-list">
        {state.participants.map((p) => (
          <div key={p.socketId} className="participant-item">
            <span className="participant-avatar">{p.name.charAt(0).toUpperCase()}</span>
            <span className="participant-name">{p.name}</span>
            {p.isHost && <span className="host-badge small">HOST</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
