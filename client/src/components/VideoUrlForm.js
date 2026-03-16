import React, { useState } from "react";
import { useSocket } from "../context/SocketContext";

export default function VideoUrlForm() {
  const { socket } = useSocket();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const detectType = (u) => {
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("vimeo.com")) return "vimeo";
    return "custom";
  };

  const handleSet = () => {
    const trimmed = url.trim();
    if (!trimmed) return setError("Please enter a video URL");
    setError("");

    socket.emit("set-video", {
      videoUrl: trimmed,
      videoType: detectType(trimmed),
    });
    setUrl("");
  };

  return (
    <div className="video-url-form">
      <div className="url-input-row">
        <input
          type="text"
          placeholder="Paste YouTube, Vimeo, or direct video URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSet()}
        />
        <button onClick={handleSet}>▶ Load</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
