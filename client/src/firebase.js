import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Replace these values with your own Firebase project config
// Go to: console.firebase.google.com → your project → Project Settings → Your apps → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyDFljk_c5LhToLbMBvpWYfmMLSNBLfRKyc",
  authDomain: "syncorion.firebaseapp.com",
  projectId: "syncorion",
  storageBucket: "syncorion.firebasestorage.app",
  messagingSenderId: "1083508116712",
  appId: "1:1083508116712:web:4020f6a41aac23c7d34d5d",
  measurementId: "G-YGBPS5NE5E"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
