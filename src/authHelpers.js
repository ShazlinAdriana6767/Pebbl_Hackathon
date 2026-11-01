import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// After a successful login or sign up: make sure the user has a document,
// then send them to the right page.
export async function finishSignIn(user, isNewUser, navigate) {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      email: user.email || "",
      createdAt: serverTimestamp(),
    });
  }

  const profileName = userSnapshot.exists() ? userSnapshot.data().name : "";
  navigate(isNewUser || !profileName ? "/profile-register" : "/home");
}

export function authErrorMessage(code) {
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email. Please log in.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/operation-not-allowed": "This sign-in method is currently unavailable.",
    "auth/popup-closed-by-user": "The sign-in window was closed before completing sign-in.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
  };
  return messages[code] || "Unable to sign in. Please try again.";
}
