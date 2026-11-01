// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCpOJXjSym6DVgddMP_AkgV5cOO688py8w",
  authDomain: "pebbl-aba31.firebaseapp.com",
  projectId: "pebbl-aba31",
  storageBucket: "pebbl-aba31.firebasestorage.app",
  messagingSenderId: "215254344183",
  appId: "1:215254344183:web:8dd051be9d8f86b1588ef2",
  measurementId: "G-34ZM31YCMY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);