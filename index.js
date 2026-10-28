import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");
const postContent = document.getElementById("post-content");
const postLocation = document.getElementById("post-location");
const submitPostBtn = document.getElementById("submit-post-btn");
const statusMsg = document.getElementById("status-msg");
const feedContainer = document.getElementById("feed-container");

let currentUser = null;

// 1. Check Authentication & Dynamically Load User Profile Name
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    try {
      // Check Cloud Firestore 'users' collection for the full name
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data().name) {
        userDisplayName.textContent = `Hello, ${userDocSnap.data().name}!`;
      } else if (user.displayName) {
        userDisplayName.textContent = `Hello, ${user.displayName}!`;
      } else {
        userDisplayName.textContent = `Hello, ${user.email}!`;
      }
    } catch (err) {
      console.error("Error fetching user name:", err);
      userDisplayName.textContent = `Hello, ${user.email}!`;
    }

    loadPosts();
  } else {
    // If user is not logged in, redirect to login page
    window.location.href = "login.html";
  }
});

// 2. Handle Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});

// 3. Simple Inappropriate Content Filter
function containsInappropriateContent(text) {
  const BANNED_WORDS = ["badword1", "hate", "spam", "abuse"];
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some(word => lowerText.includes(word));
}

// 4. Create New Post
submitPostBtn.addEventListener("click", async () => {
  const content = postContent.value.trim();
  const location = postLocation.value.trim();

  if (!content) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = "Please write something before publishing!";
    return;
  }

  if (containsInappropriateContent(content)) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = "🚫 Post blocked! Contains inappropriate language.";
    return;
  }

  try {
    submitPostBtn.disabled = true;
    submitPostBtn.textContent = "Publishing...";

    await addDoc(collection(db, "posts"), {
      authorId: currentUser.uid,
      authorEmail: currentUser.email,
      content: content,
      location: location || "General",
      moderationStatus: "clean",
      createdAt: serverTimestamp()
    });

    postContent.value = "";
    postLocation.value = "";
    statusMsg.style.color = "#38A169";
    statusMsg.textContent = "✅ Post published successfully!";

    setTimeout(() => { statusMsg.textContent = ""; }, 3000);
  } catch (err) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = `Error: ${err.message}`;
  } finally {
    submitPostBtn.disabled = false;
    submitPostBtn.textContent = "Publish Post";
  }
});

// 5. Load Real-time Feed Posts
function loadPosts() {
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));

  onSnapshot(postsQuery, (snapshot) => {
    feedContainer.innerHTML = "";

    if (snapshot.empty) {
      feedContainer.innerHTML = `<p style="color: #666;">No volunteer posts yet. Be the first to post!</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const postDate = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : "Just now";

      const card = document.createElement("div");
      card.style.cssText = "background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #666;">
          <strong>${data.authorEmail}</strong>
          <span>${postDate}</span>
        </div>
        <div style="margin-bottom: 0.5rem;">${escapeHTML(data.content)}</div>
        ${data.location ? `<span style="background: var(--vanilla); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem; color: var(--dark);">📍 ${escapeHTML(data.location)}</span>` : ""}
      `;

      feedContainer.appendChild(card);
    });
  });
}

// Helper function to prevent XSS attacks
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}