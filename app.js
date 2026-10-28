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

// 1. Check Authentication Status
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    
    // Fetch profile name from Firestore 'users' collection
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists() && userDocSnap.data().name) {
      userDisplayName.textContent = `Hello, ${userDocSnap.data().name}!`;
    } else {
      userDisplayName.textContent = user.email;
    }

    // Load feed posts
    loadPosts();
  } else {
    // If not logged in, redirect to login page
    window.location.href = "login.html";
  }
});

// 2. Handle Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});

// 3. Simple Inappropriate Word Content Filter (Content Moderation)
function containsInappropriateContent(text) {
  const BANNED_WORDS = ["badword1", "badword2", "hate", "spam", "abuse"]; // Customize your keyword blacklist here
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

  // Content Moderation Check
  if (containsInappropriateContent(content)) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = "🚫 Post blocked! Contains inappropriate language. Please edit and retry.";
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

    // Reset input form
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

// 5. Real-time Feed Listener
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
      card.className = "feed-card";
      card.innerHTML = `
        <div class="feed-header">
          <span class="author-name">${data.authorEmail}</span>
          <span class="post-time">${postDate}</span>
        </div>
        <div class="post-content">${escapeHTML(data.content)}</div>
        ${data.location ? `<span class="location-tag">📍 ${escapeHTML(data.location)}</span>` : ""}
      `;

      feedContainer.appendChild(card);
    });
  });
}

// Helper: Escape HTML to prevent XSS
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}