import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const profileForm = document.getElementById("profile-form");
const fullNameInput = document.getElementById("full-name");
const ageInput = document.getElementById("age");
const genderSelect = document.getElementById("gender");
const interestsSelect = document.getElementById("interests");
const saveBtn = document.getElementById("save-btn");
const message = document.getElementById("message");

let currentUser = null;

// Ensure user is logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  } else {
    // Redirect back to login if no active user session
    window.location.href = "login.html";
  }
});

// Save user profile details to Firestore
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving Profile...";
  message.textContent = "";

  try {
    const userDocRef = doc(db, "users", currentUser.uid);

    // Save details into user document
    await updateDoc(userDocRef, {
      name: fullNameInput.value.trim(),
      age: parseInt(ageInput.value.trim(), 10),
      gender: genderSelect.value,
      interests: [interestsSelect.value],
      updatedAt: new Date()
    });

    // Profile complete -> Navigate to homepage feed!
    window.location.href = "app-home.html";
  } catch (error) {
    message.textContent = `Error saving profile: ${error.message}`;
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Profile & Continue";
  }
});