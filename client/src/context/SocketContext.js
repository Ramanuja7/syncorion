import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

// Create socket ONCE outside the component so it's never null
const socket = io(process.env.REACT_APP_SERVER_URL || "http://localhost:5000", {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  autoConnect: true,
});

export const SocketProvider = ({ children }) => {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Connect if not already connected
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);