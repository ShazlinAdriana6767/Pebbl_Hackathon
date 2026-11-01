   import { initializeApp } from "firebase/app";
   import { getAuth, GoogleAuthProvider } from "firebase/auth";
   import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCpOJXjSym6DVgddMP_AkgV5cOO688py8w",
  authDomain: "pebbl-aba31.firebaseapp.com",
  projectId: "pebbl-aba31",
  storageBucket: "pebbl-aba31.firebasestorage.app",
  messagingSenderId: "215254344183",
  appId: "1:215254344183:web:8dd051be9d8f86b1588ef2",
  measurementId: "G-34ZM31YCMY"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
