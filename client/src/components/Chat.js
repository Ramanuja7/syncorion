import React, { useState, useRef, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { useRoom } from "../context/RoomContext";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
} from "firebase/firestore";

const AI_TRIGGER = /^\/ai\s+/i;

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:5000";

// Load Puter.js once
if (!document.getElementById("puter-script")) {
  const script = document.createElement("script");
  script.src = "https://js.puter.com/v2/";
  script.id = "puter-script";
  document.head.appendChild(script);
}

export default function Chat() {
  const { socket } = useSocket();
  const { state, dispatch } = useRoom();
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const firestoreUnsubRef = useRef(null);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  // ── Load chat history from Firestore when room is joined ───────────────────
  useEffect(() => {
    if (!state.roomId) return;

    if (firestoreUnsubRef.current) firestoreUnsubRef.current();

    const messagesRef = collection(db, "rooms", state.roomId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(100));

    firestoreUnsubRef.current = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const msg = {
            id: change.doc.id,
            senderId: data.senderId,
            senderName: data.senderName,
            text: data.text,
            timestamp: data.timestamp?.toMillis?.() || Date.now(),
            isHost: data.isHost,
            isAI: data.isAI,
            fromFirestore: true,
          };
          dispatch({ type: "ADD_MESSAGE_FROM_DB", payload: msg });
        }
      });
    });

    return () => {
      if (firestoreUnsubRef.current) firestoreUnsubRef.current();
    };
  }, [state.roomId]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    if (AI_TRIGGER.test(text)) {
      const question = text.replace(AI_TRIGGER, "").trim();
      handleAI(question);
      return;
    }

    // Emit via socket (real-time delivery)
    socket.emit("chat-message", { text });

    // Save to Firestore (persistence)
    if (state.roomId) {
      addDoc(collection(db, "rooms", state.roomId, "messages"), {
        senderId: socket.id,
        senderName: state.myName,
        text,
        isHost: state.isHost,
        isAI: false,
        timestamp: serverTimestamp(),
      }).catch(console.error);
    }
  };

  // ── AI via Puter.js ────────────────────────────────────────────────────────
  const handleAI = async (question) => {
    setAiLoading(true);

    // Save user's /ai message to Firestore
    if (state.roomId) {
      addDoc(collection(db, "rooms", state.roomId, "messages"), {
        senderId: socket.id,
        senderName: state.myName,
        text: `/ai ${question}`,
        isHost: state.isHost,
        isAI: false,
        timestamp: serverTimestamp(),
      }).catch(console.error);
    }

    try {
      // Wait for puter to load
      let attempts = 0;
      while (typeof window.puter === "undefined" && attempts < 20) {
        await new Promise((r) => setTimeout(r, 300));
        attempts++;
      }

      if (typeof window.puter === "undefined") throw new Error("Puter.js failed to load.");

      const response = await window.puter.ai.chat(question, { model: "claude-sonnet-4-6" });
      const answer = response?.message?.content?.[0]?.text || response?.toString() || "No response.";

      // Save AI answer to Firestore
      if (state.roomId) {
        addDoc(collection(db, "rooms", state.roomId, "messages"), {
          senderId: "ai",
          senderName: "🤖 AI Assistant",
          text: answer,
          isHost: false,
          isAI: true,
          timestamp: serverTimestamp(),
        }).catch(console.error);
      }
    } catch (err) {
      console.error("[AI]", err);
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: Date.now(),
          senderId: "ai",
          senderName: "🤖 AI Assistant",
          text: "AI error: " + err.message,
          timestamp: Date.now(),
          isAI: true,
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span>💬 Chat</span>
        <span className="chat-hint">/ai &lt;question&gt; for AI help</span>
      </div>

      <div className="messages-list">
        {state.messages.length === 0 && (
          <p className="empty-chat">No messages yet. Say hi!</p>
        )}
        {state.messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.system ? "system" : ""} ${msg.isAI ? "ai-message" : ""} ${msg.senderId === socket?.id ? "own-message" : ""}`}
          >
            {!msg.system && (
              <span className="msg-sender">
                {msg.senderName}
                {msg.isHost && <span className="host-tag"> 👑</span>}
              </span>
            )}
            <span className="msg-text">{msg.text}</span>
            {!msg.system && (
              <span className="msg-time">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        ))}
        {aiLoading && (
          <div className="message ai-message">
            <span className="msg-sender">🤖 AI Assistant</span>
            <span className="msg-text typing">Thinking…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          placeholder="Message or /ai <question>…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}