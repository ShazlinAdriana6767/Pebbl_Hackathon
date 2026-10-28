import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const displayNameHeader = document.getElementById("display-name-header");
const displayEmail = document.getElementById("display-email");
const avatarCircle = document.getElementById("avatar-circle");
const profileEditForm = document.getElementById("profile-edit-form");
const nameInput = document.getElementById("profile-name");
const ageInput = document.getElementById("profile-age");
const genderSelect = document.getElementById("profile-gender");
const interestSelect = document.getElementById("profile-interest");
const editToggleBtn = document.getElementById("edit-toggle-btn");
const saveProfileBtn = document.getElementById("save-profile-btn");
const statusMsg = document.getElementById("status-msg");
const logoutBtn = document.getElementById("logout-btn");
const myPostsContainer = document.getElementById("my-posts-container");

let currentUser = null;
let isEditing = false;

// 1. Check Auth state and load user profile
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    displayEmail.textContent = user.email;
    await loadUserProfile(user.uid);
    loadMyPosts(user.uid);
  } else {
    window.location.href = "login.html";
  }
});

// 2. Fetch User Record from Cloud Firestore
async function loadUserProfile(uid) {
  try {
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      nameInput.value = data.name || "";
      ageInput.value = data.age || "";
      genderSelect.value = data.gender || "Prefer not to say";
      interestSelect.value = (data.interests && data.interests[0]) ? data.interests[0] : "Others";
      
      displayNameHeader.textContent = data.name || "User Profile";
      if (data.name) {
        avatarCircle.textContent = data.name.charAt(0).toUpperCase();
      }
    }
  } catch (err) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = `Error loading profile: ${err.message}`;
  }
}

// 3. Toggle Edit / Cancel Mode
editToggleBtn.addEventListener("click", () => {
  isEditing = !isEditing;

  nameInput.disabled = !isEditing;
  ageInput.disabled = !isEditing;
  genderSelect.disabled = !isEditing;
  interestSelect.disabled = !isEditing;

  if (isEditing) {
    editToggleBtn.textContent = "Cancel";
    saveProfileBtn.style.display = "block";
  } else {
    editToggleBtn.textContent = "Edit Details";
    saveProfileBtn.style.display = "none";
    statusMsg.textContent = "";
    loadUserProfile(currentUser.uid); // Reset changes if cancelled
  }
});

// 4. Save Updated Profile Details
profileEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = "Saving...";
  statusMsg.textContent = "";

  try {
    const userDocRef = doc(db, "users", currentUser.uid);

    await updateDoc(userDocRef, {
      name: nameInput.value.trim(),
      age: parseInt(ageInput.value.trim(), 10),
      gender: genderSelect.value,
      interests: [interestSelect.value],
      updatedAt: new Date()
    });

    statusMsg.style.color = "#38A169";
    statusMsg.textContent = "✅ Profile updated successfully!";

    // Switch back to view mode
    isEditing = false;
    nameInput.disabled = true;
    ageInput.disabled = true;
    genderSelect.disabled = true;
    interestSelect.disabled = true;
    editToggleBtn.textContent = "Edit Details";
    saveProfileBtn.style.display = "none";
    
    displayNameHeader.textContent = nameInput.value.trim();
    avatarCircle.textContent = nameInput.value.trim().charAt(0).toUpperCase();
  } catch (err) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = `Error updating profile: ${err.message}`;
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = "Save Changes";
  }
});

// 5. Load Logged-in User's Personal Posts
function loadMyPosts(uid) {
  const postsQuery = query(
    collection(db, "posts"),
    where("authorId", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(postsQuery, (snapshot) => {
    myPostsContainer.innerHTML = "";

    if (snapshot.empty) {
      myPostsContainer.innerHTML = `<p style="color: #666;">You haven't published any posts yet.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const postDate = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : "Just now";

      const card = document.createElement("div");
      card.className = "feed-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
          <span class="post-time">${postDate}</span>
          ${data.location ? `<span class="location-tag">📍 ${escapeHTML(data.location)}</span>` : ""}
        </div>
        <div class="post-content">${escapeHTML(data.content)}</div>
      `;

      myPostsContainer.appendChild(card);
    });
  }, (error) => {
    console.error("My Posts listener error:", error);
    myPostsContainer.innerHTML = `<p style="color: #666;">Create an index in Firestore or publish your first post!</p>`;
  });
}

// 6. Logout Handling
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => { window.location.href = "login.html"; });
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}