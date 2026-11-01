import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const createGroupForm = document.getElementById("create-group-form");
const groupNameInput = document.getElementById("group-name");
const groupCategorySelect = document.getElementById("group-category");
const groupDescInput = document.getElementById("group-desc");
const createBtn = document.getElementById("create-btn");
const statusMsg = document.getElementById("status-msg");
const groupsContainer = document.getElementById("groups-container");
const logoutBtn = document.getElementById("logout-btn");

let currentUser = null;

// Auth status check
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadCommunities();
  } else {
    window.location.href = "login.html";
  }
});

// Create new group
createGroupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  createBtn.disabled = true;
  createBtn.textContent = "Creating...";
  statusMsg.textContent = "";

  try {
    await addDoc(collection(db, "communities"), {
      name: groupNameInput.value.trim(),
      category: groupCategorySelect.value,
      description: groupDescInput.value.trim(),
      createdBy: currentUser.uid,
      members: [currentUser.uid],
      createdAt: serverTimestamp()
    });

    statusMsg.style.color = "#38A169";
    statusMsg.textContent = "✅ Group created successfully!";

    groupNameInput.value = "";
    groupDescInput.value = "";
    groupCategorySelect.selectedIndex = 0;
    setTimeout(() => { statusMsg.textContent = ""; }, 3000);
  } catch (err) {
    statusMsg.style.color = "#E53E3E";
    statusMsg.textContent = `Error creating group: ${err.message}`;
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Create Group";
  }
});

// Load communities in real-time
function loadCommunities() {
  const q = query(collection(db, "communities"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    groupsContainer.innerHTML = "";

    if (snapshot.empty) {
      groupsContainer.innerHTML = `<p style="color: #666; grid-column: 1/-1; text-align: center;">No community groups created yet. Be the first!</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const group = docSnap.data();
      const groupId = docSnap.id;
      const members = group.members || [];
      const isJoined = members.includes(currentUser.uid);

      const card = document.createElement("div");
      card.className = "group-card";
      card.innerHTML = `
        <div>
          <span class="group-category">${escapeHTML(group.category)}</span>
          <div class="group-title">${escapeHTML(group.name)}</div>
          <div class="group-desc">${escapeHTML(group.description)}</div>
        </div>
        <div class="group-footer">
          <span class="member-count">👥 ${members.length} Member${members.length === 1 ? "" : "s"}</span>
          <button class="join-btn ${isJoined ? 'joined' : ''}" data-id="${groupId}" data-joined="${isJoined}">
            ${isJoined ? 'Leave Group' : 'Join Group'}
          </button>
        </div>
      `;

      groupsContainer.appendChild(card);
    });

    // Attach Join/Leave event listeners
    document.querySelectorAll(".join-btn").forEach(button => {
      button.addEventListener("click", handleJoinLeave);
    });
  });
}

// Toggle Join / Leave status
async function handleJoinLeave(e) {
  const groupId = e.target.getAttribute("data-id");
  const isJoined = e.target.getAttribute("data-joined") === "true";
  const groupRef = doc(db, "communities", groupId);

  e.target.disabled = true;

  try {
    if (isJoined) {
      await updateDoc(groupRef, { members: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(groupRef, { members: arrayUnion(currentUser.uid) });
    }
  } catch (err) {
    console.error("Error toggling group status:", err);
  }
}

// Logout Listener
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => { window.location.href = "login.html"; });
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}