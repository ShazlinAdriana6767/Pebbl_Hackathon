import { auth, db } from "./firebase.js";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const postContent = document.getElementById("post-content");
const postLocation = document.getElementById("post-location");
const postImageInput = document.getElementById("post-image");
const imagePreviewContainer = document.getElementById("image-preview-container");
const imagePreview = document.getElementById("image-preview");
const submitPostBtn = document.getElementById("submit-post-btn");
const statusMsg = document.getElementById("status-msg");
const feedContainer = document.getElementById("feed-container");

let base64ImageString = "";

// 1. Preview image and convert to Base64 on file selection
postImageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    // Check file size (keep under 1MB for Firestore performance)
    if (file.size > 1024 * 1024) {
      statusMsg.style.color = "#E53E3E";
      statusMsg.textContent = "⚠️ Image is too large! Please pick an image under 1MB.";
      postImageInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      base64ImageString = event.target.result;
      imagePreview.src = base64ImageString;
      imagePreviewContainer.style.display = "block";
    };
    reader.readAsDataURL(file);
  } else {
    base64ImageString = "";
    imagePreviewContainer.style.display = "none";
  }
});

// 2. Submit post with Image
submitPostBtn.addEventListener("click", async () => {
  const content = postContent.value.trim();
  const location = postLocation.value.trim();

  if (!content && !base64ImageString) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = "Please add text or select an image!";
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = "You must be logged in to post.";
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
      imageUrl: base64ImageString || null, // Saves the base64 image string directly
      createdAt: serverTimestamp()
    });

    // Reset inputs
    postContent.value = "";
    postLocation.value = "";
    postImageInput.value = "";
    base64ImageString = "";
    imagePreviewContainer.style.display = "none";

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

// 3. Render Posts Feed with Attached Images
export function loadPosts() {
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));

  onSnapshot(postsQuery, (snapshot) => {
    feedContainer.innerHTML = "";

    if (snapshot.empty) {
      feedContainer.innerHTML = `<p style="color: #666; text-align: center;">No volunteer posts yet. Be the first to post!</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const postDate = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : "Just now";

      const card = document.createElement("div");
      card.style.cssText = "background: white; padding: 1.2rem; border-radius: 12px; margin-bottom: 1rem; box-shadow: 0 2px 6px rgba(0,0,0,0.06);";
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #666;">
          <strong>${escapeHTML(data.authorEmail || "Volunteer")}</strong>
          <span>${postDate}</span>
        </div>
        <div style="margin-bottom: 0.75rem; font-size: 1rem;">${escapeHTML(data.content)}</div>
        
        <!-- Render image if present -->
        ${data.imageUrl ? `
          <div style="margin-bottom: 0.75rem;">
            <img src="${data.imageUrl}" alt="Volunteer Post Image" style="width: 100%; max-height: 350px; object-fit: cover; border-radius: 8px;">
          </div>
        ` : ''}

        ${data.location ? `<span style="background: #FFEBAF; padding: 0.25rem 0.7rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">📍 ${escapeHTML(data.location)}</span>` : ""}
      `;

      feedContainer.appendChild(card);
    });
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}