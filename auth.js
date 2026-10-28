import { auth, db, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("auth-form");
const authForm = signupForm || loginForm;
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit-btn");
const googleButton = document.getElementById("google-btn");
const message = document.getElementById("message");
const isSignup = Boolean(signupForm);

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  message.textContent = "";

  try {
    const credential = isSignup
      ? await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
      : await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);

    await finishSignIn(credential.user, isSignup);
  } catch (error) {
    message.textContent = authErrorMessage(error.code);
    setBusy(false);
  }
});

googleButton?.addEventListener("click", async () => {
  setBusy(true);
  message.textContent = "";

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const isNewUser = getAdditionalUserInfo(credential)?.isNewUser ?? false;
    await finishSignIn(credential.user, isNewUser);
  } catch (error) {
    message.textContent = authErrorMessage(error.code);
    setBusy(false);
  }
});

async function finishSignIn(user, isNewUser) {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      email: user.email || "",
      createdAt: serverTimestamp()
    });
  }

  const profileName = userSnapshot.exists() ? userSnapshot.data().name : "";
  window.location.href = isNewUser || !profileName ? "profile-register.html" : "index.html";
}

function setBusy(isBusy) {
  if (submitButton) submitButton.disabled = isBusy;
  if (googleButton) googleButton.disabled = isBusy;
}

function authErrorMessage(code) {
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email. Please log in.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/operation-not-allowed": "This sign-in method is currently unavailable.",
    "auth/popup-closed-by-user": "The sign-in window was closed before completing sign-in.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your connection and try again."
  };

  return messages[code] || "Unable to sign in. Please try again.";
}
