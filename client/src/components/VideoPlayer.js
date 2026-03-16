import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { useRoom } from "../context/RoomContext";

// ── YouTube iframe API wrapper ─────────────────────────────────────────────────
function YouTubePlayer({ videoId, videoState, isHost, onTimeUpdate }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    const initPlayer = () => {
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { controls: isHost ? 1 : 0, disablekb: isHost ? 0 : 1, rel: 0 },
        events: {
          onReady: (e) => {
            if (!videoState.playing) e.target.pauseVideo();
          },
          onStateChange: (e) => {
            if (isHost) {
              onTimeUpdate(e.target.getCurrentTime(), e.data === window.YT.PlayerState.PLAYING);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current?.destroy) playerRef.current.destroy();
    };
  }, [videoId]);

  // Sync from server
  useEffect(() => {
    if (!playerRef.current?.getPlayerState) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 500) return; // debounce
    lastSyncRef.current = now;

    const currentTime = playerRef.current.getCurrentTime?.() || 0;
    const drift = Math.abs(currentTime - videoState.time);

    if (drift > 1.5) playerRef.current.seekTo?.(videoState.time, true);
    if (videoState.playing) {
      playerRef.current.playVideo?.();
    } else {
      playerRef.current.pauseVideo?.();
    }
  }, [videoState]);

  return <div ref={containerRef} className="yt-player" />;
}

// ── HTML5 Video wrapper ────────────────────────────────────────────────────────
function HTML5Player({ src, videoState, isHost, onTimeUpdate }) {
  const videoRef = useRef(null);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    if (!videoRef.current) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 500) return;
    lastSyncRef.current = now;

    const drift = Math.abs(videoRef.current.currentTime - videoState.time);
    if (drift > 1.5) videoRef.current.currentTime = videoState.time;

    if (videoState.playing) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [videoState]);

  const handlePlay = () => {
    if (isHost) onTimeUpdate(videoRef.current.currentTime, true);
  };
  const handlePause = () => {
    if (isHost) onTimeUpdate(videoRef.current.currentTime, false);
  };
  const handleSeeked = () => {
    if (isHost) onTimeUpdate(videoRef.current.currentTime, !videoRef.current.paused);
  };

  return (
    <video
      ref={videoRef}
      src={src}
      controls={isHost}
      className="html5-player"
      onPlay={handlePlay}
      onPause={handlePause}
      onSeeked={handleSeeked}
    />
  );
}

// ── Main VideoPlayer ───────────────────────────────────────────────────────────
export default function VideoPlayer() {
  const { socket } = useSocket();
  const { state } = useRoom();
  const heartbeatRef = useRef(null);
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);

  // Host heartbeat — sends time every 3s for drift correction
  useEffect(() => {
    if (!state.isHost || !socket) return;

    heartbeatRef.current = setInterval(() => {
      socket.emit("host-heartbeat", {
        time: currentTimeRef.current,
        playing: playingRef.current,
      });
    }, 3000);

    return () => clearInterval(heartbeatRef.current);
  }, [state.isHost, socket]);

  const handleTimeUpdate = (time, playing) => {
    currentTimeRef.current = time;
    playingRef.current = playing;
    socket.emit("playback-control", {
      action: playing ? "play" : "pause",
      time,
    });
  };

  if (!state.videoUrl) {
    return (
      <div className="video-placeholder">
        <div className="placeholder-inner">
          <span className="placeholder-icon">▶</span>
          <p>{state.isHost ? "Add a video URL above to get started" : "Waiting for host to load a video…"}</p>
        </div>
      </div>
    );
  }

  const { videoUrl, videoType, videoState, isHost } = state;

  const getYouTubeId = (url) => {
    const match = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return match?.[1] || "";
  };

  return (
    <div className="video-wrapper">
      {videoType === "youtube" && (
        <YouTubePlayer
          videoId={getYouTubeId(videoUrl)}
          videoState={videoState}
          isHost={isHost}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
      {videoType === "vimeo" && (
        <iframe
          src={`https://player.vimeo.com/video/${videoUrl.split("/").pop()}?autoplay=0`}
          className="vimeo-player"
          allow="autoplay; fullscreen"
          title="Vimeo Player"
        />
      )}
      {videoType === "custom" && (
        <HTML5Player
          src={videoUrl}
          videoState={videoState}
          isHost={isHost}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
    </div>
  );
}
