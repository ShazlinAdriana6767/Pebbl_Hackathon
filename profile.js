import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayRemove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ---------- Constants ---------- */
const DEFAULT_TITLE = "Volunteer Member";

const INTEREST_OPTIONS = [
  "Sports & Marathons",
  "Environment & Nature",
  "Animal Welfare",
  "Community & Elderly Care",
  "Education & Youth",
  "Disaster Relief & First Aid",
  "Arts & Cultural Events",
  "Others"
];

// Every badge is calculated from real data. value(stats) must return a number.
const BADGES = [
  { id: "sprout",      icon: "🌱", title: "Sprout",           desc: "Join 3 communities",           goal: 3,  value: s => s.clubsJoined },
  { id: "butterfly",   icon: "🦋", title: "Social Butterfly", desc: "Join 6 communities",           goal: 6,  value: s => s.clubsJoined },
  { id: "firstwords",  icon: "✍️", title: "First Words",      desc: "Publish your first post",      goal: 1,  value: s => s.posts },
  { id: "storyteller", icon: "📚", title: "Storyteller",      desc: "Publish 10 posts",             goal: 10, value: s => s.posts },
  { id: "snapshot",    icon: "📸", title: "Snapshot",         desc: "Post a photo",                 goal: 1,  value: s => s.photoPosts },
  { id: "starter",     icon: "📍", title: "Event Starter",    desc: "Create your first event",      goal: 1,  value: s => s.events },
  { id: "host",        icon: "🎪", title: "Event Host",       desc: "Create 5 events",              goal: 5,  value: s => s.events },
  { id: "founder",     icon: "🏛️", title: "Club Founder",     desc: "Start a community",            goal: 1,  value: s => s.clubsCreated },
  { id: "kind",        icon: "❤️", title: "Kind Heart",       desc: "Like 5 posts",                 goal: 5,  value: s => s.likesGiven },
  { id: "favourite",   icon: "🌟", title: "Crowd Favourite",  desc: "Receive 10 likes on your posts", goal: 10, value: s => s.likesReceived },
  { id: "complete",    icon: "🧩", title: "All Set",          desc: "Fill in name, age, location and interest", goal: 4, value: s => s.profileFields },
  { id: "regular",     icon: "🗓️", title: "Regular",          desc: "Be a member for 30 days",      goal: 30, value: s => s.daysMember }
];

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const userNameEl = $("user-name");
const userAvatarEl = $("user-avatar");
const userTitleEl = $("user-pronouns");
const userMetaEl = $("user-meta");
const statMemberSinceEl = $("stat-member-since");
const statPostsCountEl = $("stat-posts-count");
const statBadgesCountEl = $("stat-badges-count");
const tabContentView = $("tab-content-view");

const modal = $("edit-modal");
const editForm = $("edit-form");
const editName = $("edit-name");
const editAge = $("edit-age");
const editGender = $("edit-gender");
const editLocation = $("edit-location");
const editTitle = $("edit-title");
const titleHint = $("edit-title-hint");
const interestChips = $("edit-interests");
const editStatus = $("edit-status");
const editSaveBtn = $("edit-save-btn");

/* ---------- State ---------- */
let currentUser = null;
let currentTab = "btn-tab-profile";
const state = {
  profile: {},
  myPosts: [],
  likedPosts: [],
  myEvents: [],
  clubsJoined: [],
  clubsCreated: []
};

/* ---------- Helpers ---------- */
function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>'"]/g, tag => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[tag] || tag
  ));
}

const toDate = ts => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmtDate = d => (d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "Just now");
const fmtMonth = d => (d ? d.toLocaleDateString("en-MY", { month: "short", year: "numeric" }) : "—");
const millis = ts => (toDate(ts) ? toDate(ts).getTime() : Date.now());
const snapToList = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const byNewest = (a, b) => millis(b.createdAt) - millis(a.createdAt);
const postImage = p => p.image || p.imageUrl || "";

function authorLabel(p) {
  if (currentUser && p.authorId === currentUser.uid && state.profile.name) return state.profile.name;
  const raw = p.authorUsername || p.authorEmail || "Volunteer";
  return raw.includes("@") ? raw.split("@")[0] : raw;
}

/* ---------- Derived data ---------- */
function getStats() {
  const p = state.profile;
  const memberDate = toDate(p.createdAt) || (currentUser?.metadata?.creationTime ? new Date(currentUser.metadata.creationTime) : null);
  const daysMember = memberDate ? Math.floor((Date.now() - memberDate.getTime()) / 86400000) : 0;

  return {
    memberDate,
    daysMember,
    posts: state.myPosts.length,
    photoPosts: state.myPosts.filter(x => postImage(x)).length,
    events: state.myEvents.length,
    clubsJoined: state.clubsJoined.length,
    clubsCreated: state.clubsCreated.length,
    likesGiven: state.likedPosts.length,
    likesReceived: state.myPosts.reduce((sum, x) => sum + (Array.isArray(x.likes) ? x.likes.length : 0), 0),
    profileFields: [p.name, p.age, p.location, (p.interests || []).length ? "x" : ""].filter(Boolean).length
  };
}

const isEventCreator = () => state.myEvents.length > 0;

function currentTitle() {
  const saved = (state.profile.title || "").trim();
  return isEventCreator() && saved ? saved : DEFAULT_TITLE;
}

function earnedBadges(stats) {
  return BADGES.filter(b => b.value(stats) >= b.goal);
}

/* ---------- Rendering: sidebar ---------- */
function renderSidebar() {
  const p = state.profile;
  const stats = getStats();
  const name = p.name || currentUser.displayName || currentUser.email.split("@")[0];

  userNameEl.textContent = name;
  userAvatarEl.textContent = name.charAt(0).toUpperCase();
  userTitleEl.textContent = currentTitle();

  const meta = [];
  if (p.location) meta.push(`📍 ${p.location}`);
  if (p.age) meta.push(`${p.age} yrs`);
  if (p.gender) meta.push(p.gender);
  userMetaEl.textContent = meta.join(" • ");

  statMemberSinceEl.textContent = fmtMonth(stats.memberDate);
  statPostsCountEl.textContent = stats.posts;
  statBadgesCountEl.textContent = `${earnedBadges(stats).length} / ${BADGES.length} Earned`;
}

/* ---------- Rendering: tabs ---------- */
function postCardHTML(post, { unlikeBtn = false } = {}) {
  const img = postImage(post);
  const likeCount = Array.isArray(post.likes) ? post.likes.length : 0;
  return `
    <div class="post-card">
      <div class="post-header">
        <span class="post-author">🟢 ${escapeHTML(authorLabel(post))}</span>
        <span class="post-time">${fmtDate(toDate(post.createdAt))}</span>
      </div>
      <div style="font-size: 0.98rem; line-height: 1.4;">${escapeHTML(post.content)}</div>
      ${img ? `<img src="${escapeHTML(img)}" alt="Post image" class="post-image-preview">` : ""}
      <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        ${post.location ? `<span style="background: var(--vanilla); padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">📍 ${escapeHTML(post.location)}</span>` : ""}
        <span style="font-size: 0.85rem; color: #718096;">❤️ ${likeCount}</span>
        ${unlikeBtn ? `<button class="unlike-btn" data-postid="${post.id}">Remove from favourites</button>` : ""}
      </div>
    </div>`;
}

function renderProfileView() {
  const p = state.profile;
  const interests = p.interests || [];

  const activity = [
    ...state.myPosts.map(x => ({ icon: "📝", text: `Posted: ${(x.content || "(photo)").slice(0, 80)}`, time: x.createdAt })),
    ...state.myEvents.map(x => ({ icon: "📍", text: `Created event: ${x.title || "Volunteer Event"}`, time: x.createdAt })),
    ...state.clubsCreated.map(x => ({ icon: "🏛️", text: `Started community: ${x.name}`, time: x.createdAt }))
  ].sort((a, b) => millis(b.time) - millis(a.time)).slice(0, 8);

  tabContentView.innerHTML = `
    <h3 style="margin-bottom: 0.8rem;">About</h3>
    <div class="about-grid">
      <div><span class="stat-label">Age</span><div class="stat-value">${p.age ? escapeHTML(p.age) : "Not set"}</div></div>
      <div><span class="stat-label">Gender</span><div class="stat-value">${p.gender ? escapeHTML(p.gender) : "Not set"}</div></div>
      <div><span class="stat-label">Based in</span><div class="stat-value">${p.location ? escapeHTML(p.location) : "Not set"}</div></div>
      <div><span class="stat-label">Title</span><div class="stat-value">${escapeHTML(currentTitle())}</div></div>
    </div>
    <div style="margin: 0.8rem 0 1.5rem;">
      <span class="stat-label">Interests</span>
      <div style="margin-top: 0.4rem;">
        ${interests.length ? interests.map(i => `<span class="chip selected">${escapeHTML(i)}</span>`).join("") : `<span style="color:#718096; font-size:0.9rem;">Not set</span>`}
      </div>
    </div>

    <h3 style="margin-bottom: 0.8rem;">Recent Activity</h3>
    ${activity.length ? activity.map(a => `
      <div class="post-card" style="padding: 0.8rem 1rem; margin-bottom: 0.6rem;">
        <div class="post-header" style="margin-bottom: 0;">
          <span>${a.icon} ${escapeHTML(a.text)}</span>
          <span class="post-time">${fmtDate(toDate(a.time))}</span>
        </div>
      </div>`).join("") : `<p style="color: #666;">No activity yet. Share a post on the Clubs page and it will show up here.</p>`}
  `;
}

function renderPostsView() {
  const list = [...state.myPosts].sort(byNewest);
  tabContentView.innerHTML = `
    <h3 style="margin-bottom: 1rem;">My Volunteer Posts (${list.length})</h3>
    ${list.length ? list.map(p => postCardHTML(p)).join("") : `<p style="color: #666;">You haven't published any volunteer posts yet!</p>`}
  `;
}

function renderFavoritesView() {
  const list = [...state.likedPosts].sort(byNewest);
  tabContentView.innerHTML = `
    <h3 style="margin-bottom: 0.5rem;">Favourites (${list.length})</h3>
    <p style="color: #718096; font-size: 0.9rem; margin-bottom: 1.2rem;">Posts you have liked.</p>
    ${list.length ? list.map(p => postCardHTML(p, { unlikeBtn: true })).join("") : `<p style="color: #666;">You haven't liked any posts yet.</p>`}
  `;

  tabContentView.querySelectorAll(".unlike-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "posts", btn.dataset.postid), { likes: arrayRemove(currentUser.uid) });
      } catch (err) {
        btn.disabled = false;
        alert(`Could not update: ${err.message}`);
      }
    });
  });
}

function renderBadgesView() {
  const stats = getStats();
  tabContentView.innerHTML = `
    <h3 style="margin-bottom: 0.5rem;">Badges</h3>
    <p style="color: #718096; font-size: 0.9rem; margin-bottom: 1.2rem;">Earned automatically from what you do on Pebbl.</p>
    <div class="badges-grid">
      ${BADGES.map(b => {
        const value = Math.min(b.value(stats), b.goal);
        const earned = value >= b.goal;
        return `
          <div class="badge-card ${earned ? "" : "locked"}">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-title">${escapeHTML(b.title)}</div>
            <div class="badge-desc">${escapeHTML(b.desc)}</div>
            <div class="badge-progress">${earned ? "✅ Earned" : `${value} / ${b.goal}`}</div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function renderCurrentTab() {
  if (currentTab === "btn-tab-posts") return renderPostsView();
  if (currentTab === "btn-tab-favorites") return renderFavoritesView();
  if (currentTab === "btn-tab-badges") return renderBadgesView();
  return renderProfileView();
}

function renderAll() {
  if (!currentUser) return;
  renderSidebar();
  renderCurrentTab();
}

function setTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.id === tabId));
  renderCurrentTab();
}

/* ---------- Data loading ---------- */
async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    state.profile = snap.exists() ? snap.data() : {};
  } catch (err) {
    console.error("Error loading user profile:", err);
  }
}

// Queries use a single filter each, so no Firestore composite index is needed.
function listen(q, key) {
  onSnapshot(q, snap => {
    state[key] = snapToList(snap);
    renderAll();
  }, err => console.error(`Listener error (${key}):`, err));
}

function startListeners(uid) {
  listen(query(collection(db, "posts"), where("authorId", "==", uid)), "myPosts");
  listen(query(collection(db, "posts"), where("likes", "array-contains", uid)), "likedPosts");
  listen(query(collection(db, "events"), where("authorId", "==", uid)), "myEvents");
  listen(query(collection(db, "communities"), where("members", "array-contains", uid)), "clubsJoined");
  listen(query(collection(db, "communities"), where("createdBy", "==", uid)), "clubsCreated");
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  await loadProfile(user.uid);
  renderAll();
  startListeners(user.uid);
});

/* ---------- Edit profile modal ---------- */
let selectedInterests = [];

function drawInterestChips() {
  interestChips.innerHTML = INTEREST_OPTIONS.map(i =>
    `<button type="button" class="chip ${selectedInterests.includes(i) ? "selected" : ""}" data-interest="${escapeHTML(i)}">${escapeHTML(i)}</button>`
  ).join("");
}

interestChips.addEventListener("click", e => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const value = btn.dataset.interest;
  selectedInterests = selectedInterests.includes(value)
    ? selectedInterests.filter(i => i !== value)
    : [...selectedInterests, value];
  drawInterestChips();
});

function openModal() {
  const p = state.profile;
  editName.value = p.name || "";
  editAge.value = p.age || "";
  editGender.value = p.gender || "";
  editLocation.value = p.location || "";
  selectedInterests = [...(p.interests || [])];
  drawInterestChips();

  if (isEventCreator()) {
    editTitle.disabled = false;
    editTitle.value = p.title || "";
    titleHint.textContent = `Leave empty to use "${DEFAULT_TITLE}".`;
  } else {
    editTitle.disabled = true;
    editTitle.value = "";
    titleHint.textContent = "Create an event on the Clubs page to unlock a custom title.";
  }

  editStatus.textContent = "";
  modal.style.display = "flex";
}

const closeModal = () => { modal.style.display = "none"; };

$("customize-profile-btn").addEventListener("click", openModal);
$("close-edit-modal").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

editForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return;

  const name = editName.value.trim();
  const ageText = editAge.value.trim();
  const gender = editGender.value;
  const location = editLocation.value.trim();
  const title = editTitle.value.trim();

  const fail = msg => { editStatus.style.color = "#E53E3E"; editStatus.textContent = msg; };

  if (name.length < 2 || name.length > 30) return fail("Username must be 2 to 30 characters.");
  const age = ageText ? parseInt(ageText, 10) : null;
  if (age !== null && (Number.isNaN(age) || age < 1 || age > 120)) return fail("Enter a valid age.");
  if (title.length > 40) return fail("Title must be 40 characters or less.");

  editSaveBtn.disabled = true;
  editSaveBtn.textContent = "Saving...";

  try {
    const update = {
      name,
      age,
      gender,
      location,
      interests: selectedInterests,
      updatedAt: serverTimestamp()
    };

    // A custom title is only allowed if the user has created an event. Re-check on the server.
    if (title) {
      const check = await getDocs(query(collection(db, "events"), where("authorId", "==", currentUser.uid), limit(1)));
      if (check.empty) {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = "Save Changes";
        return fail("You need to create an event before you can set a custom title.");
      }
      update.title = title;
    } else if (isEventCreator()) {
      update.title = "";
    }

    await setDoc(doc(db, "users", currentUser.uid), update, { merge: true });
    await loadProfile(currentUser.uid);
    renderAll();
    closeModal();
  } catch (err) {
    fail(`Error saving profile: ${err.message}`);
  } finally {
    editSaveBtn.disabled = false;
    editSaveBtn.textContent = "Save Changes";
  }
});

/* ---------- Tab + button handlers ---------- */
$("btn-tab-profile").addEventListener("click", () => setTab("btn-tab-profile"));
$("btn-tab-posts").addEventListener("click", () => setTab("btn-tab-posts"));
$("btn-tab-favorites").addEventListener("click", () => setTab("btn-tab-favorites"));
$("btn-tab-badges").addEventListener("click", () => setTab("btn-tab-badges"));

$("quick-favorites").addEventListener("click", () => setTab("btn-tab-favorites"));
$("quick-view-badges").addEventListener("click", () => setTab("btn-tab-badges"));
$("quick-add-post").addEventListener("click", () => { window.location.href = "app-home.html"; });

$("logout-btn").addEventListener("click", () => {
  signOut(auth).then(() => { window.location.href = "login.html"; });
});
