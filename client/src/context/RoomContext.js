import React, { createContext, useContext, useReducer } from "react";

const RoomContext = createContext(null);

const initialState = {
  roomId: null,
  myName: "",
  mySocketId: null,
  isHost: false,
  hostId: null,
  hostName: "",
  participants: [],
  videoUrl: "",
  videoType: "youtube",
  videoState: { playing: false, time: 0 },
  messages: [],
  connected: false,
};

function roomReducer(state, action) {
  switch (action.type) {
    case "JOIN_ROOM":
      return { ...state, ...action.payload, connected: true };
    case "SET_VIDEO":
      return { ...state, videoUrl: action.payload.videoUrl, videoType: action.payload.videoType, videoState: { playing: false, time: 0 } };
    case "SYNC_PLAYBACK":
      return { ...state, videoState: { playing: action.payload.playing, time: action.payload.time } };
    case "UPDATE_PARTICIPANTS":
      return { ...state, participants: action.payload };
    case "HOST_CHANGED":
      return {
        ...state,
        hostId: action.payload.newHostId,
        hostName: action.payload.newHostName,
        isHost: state.mySocketId === action.payload.newHostId,
      };
    case "ADD_MESSAGE":
      // Prevent duplicate socket IDs
      if (state.messages.find((m) => m.id === action.payload.id)) return state;
      return { ...state, messages: [...state.messages, action.payload] };
    case "ADD_MESSAGE_FROM_DB":
      // Prevent duplicate Firestore doc IDs
      if (state.messages.find((m) => m.id === action.payload.id)) return state;
      return {
        ...state,
        messages: [...state.messages, action.payload].sort((a, b) => a.timestamp - b.timestamp),
      };
    case "SET_MY_SOCKET_ID":
      return { ...state, mySocketId: action.payload };
    case "LEAVE_ROOM":
      return initialState;
    default:
      return state;
  }
}

export const RoomProvider = ({ children }) => {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  return (
    <RoomContext.Provider value={{ state, dispatch }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
