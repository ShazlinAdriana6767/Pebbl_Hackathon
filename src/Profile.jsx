import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, query, where, limit, onSnapshot, doc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { useCurrentUser } from "./useCurrentUser";
import { useAuthorNames } from "./useAuthorNames";
import { checkText, checkPost } from "./geminiCheck";
import AppHeader from "./AppHeader";
import "./Profile.css";

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
  "Others",
];

// Every badge is worked out from real data. value(stats) must return a number.
const BADGES = [
  { id: "sprout", icon: "🌱", title: "Sprout", desc: "Join 3 communities", goal: 3, value: (s) => s.clubsJoined },
  { id: "butterfly", icon: "🦋", title: "Social Butterfly", desc: "Join 6 communities", goal: 6, value: (s) => s.clubsJoined },
  { id: "firstwords", icon: "✍️", title: "First Words", desc: "Publish your first post", goal: 1, value: (s) => s.posts },
  { id: "storyteller", icon: "📚", title: "Storyteller", desc: "Publish 10 posts", goal: 10, value: (s) => s.posts },
  { id: "snapshot", icon: "📸", title: "Snapshot", desc: "Post a photo", goal: 1, value: (s) => s.photoPosts },
  { id: "pin", icon: "📍", title: "Pin Dropper", desc: "Share a post with a location", goal: 1, value: (s) => s.placePosts },
  { id: "guide", icon: "🧭", title: "Local Guide", desc: "Share 5 posts with a location", goal: 5, value: (s) => s.placePosts },
  { id: "founder", icon: "🏛️", title: "Club Founder", desc: "Start a community", goal: 1, value: (s) => s.clubsCreated },
  { id: "kind", icon: "❤️", title: "Kind Heart", desc: "Like 5 posts", goal: 5, value: (s) => s.likesGiven },
  { id: "favourite", icon: "🌟", title: "Crowd Favourite", desc: "Get 10 likes on your posts", goal: 10, value: (s) => s.likesReceived },
  { id: "complete", icon: "🧩", title: "All Set", desc: "Fill in name, age, location and interest", goal: 4, value: (s) => s.profileFields },
  { id: "regular", icon: "🗓️", title: "Regular", desc: "Be a member for 30 days", goal: 30, value: (s) => s.daysMember },
];

/* ---------- Helpers ---------- */
const toDate = (ts) => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmtDate = (d) => (d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "Just now");
const fmtMonth = (d) => (d ? d.toLocaleDateString("en-MY", { month: "short", year: "numeric" }) : "—");
const millis = (ts) => toDate(ts)?.getTime() ?? Date.now();
const newest = (a, b) => millis(b.createdAt) - millis(a.createdAt);
const imageOf = (p) => p.imageUrl || p.image || "";
const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const hasPlace = (p) => p.location && p.location.trim() && p.location !== "General";

// Live list from one Firestore query. Each query has a single filter, so no index is needed.
function useQueryList(build, deps) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = build();
    if (!q) {
      setItems([]);
      return;
    }
    return onSnapshot(q, (snap) => setItems(toList(snap)), (err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return items;
}

/* ---------- Small pieces ---------- */
function PostCard({ post, name, uid, onLike, onOpenMap, onRemove, removeLabel }) {
  const img = imageOf(post);
  const likes = Array.isArray(post.likes) ? post.likes.length : 0;
  const liked = Array.isArray(post.likes) && post.likes.includes(uid);
  return (
    <div className="pf-post-card" id={`pf-post-${post.id}`}>
      <div className="pf-post-header">
        <span className="pf-post-author"><span className="pf-avatar-sm">{(name || "V").charAt(0).toUpperCase()}</span>{name}</span>
        <span className="pf-post-time">{fmtDate(toDate(post.createdAt))}</span>
      </div>
      {post.content && <div className="pf-post-text">{post.content}</div>}
      {img && <img src={img} alt="Post" className="pf-post-image" />}
      <div className="pf-post-foot">
        {hasPlace(post) && (
          <button className="pf-chip-btn" onClick={() => onOpenMap(post.id)} title="Show on the Events Map">
            📍 {post.location}
          </button>
        )}
        <button className={`pf-heart${liked ? " on" : ""}`} onClick={() => onLike(post)} title={liked ? "Unlike" : "Like"}>
          {liked ? "❤️" : "🤍"} {likes}
        </button>
        {onRemove && (
          <button className="pf-small-btn" onClick={() => onRemove(post)}>{removeLabel}</button>
        )}
      </div>
    </div>
  );
}

function ClubManager({ club, posts }) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState("members"); // "edit" | "members" | "posts"
  const [form, setForm] = useState({
    name: club.name || "",
    category: club.category || INTEREST_OPTIONS[0],
    description: club.description || "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [memberNames, setMemberNames] = useState({});

  const members = club.members || [];
  const clubPosts = posts.filter((p) => p.communityId === club.id).sort(newest);
  const categories = INTEREST_OPTIONS.includes(form.category) ? INTEREST_OPTIONS : [form.category, ...INTEREST_OPTIONS];

  const toggle = (name) => {
    setPanel((p) => (p === name ? null : name));
    setMsg("");
  };

  // Load member names when the Members panel opens
  useEffect(() => {
    if (panel !== "members") return;
    const missing = members.filter((id) => !(id in memberNames));
    if (!missing.length) return;
    let alive = true;
    Promise.all(
      missing.map(async (id) => {
        try {
          const s = await getDoc(doc(db, "users", id));
          return [id, s.exists() ? s.data().name || "Volunteer" : "Volunteer"];
        } catch {
          return [id, "Volunteer"];
        }
      })
    ).then((entries) => alive && setMemberNames((prev) => ({ ...prev, ...Object.fromEntries(entries) })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, members.join(",")]);

  const save = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 3 || name.length > 60) return setMsg("Club name must be 3 to 60 characters.");
    setBusy(true);
    try {
      setMsg("Checking with Gemini…");
      const verdict = await checkText(`${name}\n${form.description}`, "a volunteer club’s name and description");
      if (!verdict.approved) return setMsg(`🚫 ${verdict.reason}`);
      await updateDoc(doc(db, "communities", club.id), {
        name,
        category: form.category,
        description: form.description.trim(),
      });
      setMsg("✅ Saved!");
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (id) => {
    if (!window.confirm(`Remove ${memberNames[id] || "this member"} from the club?`)) return;
    try {
      await updateDoc(doc(db, "communities", club.id), { members: arrayRemove(id) });
    } catch (err) {
      alert(`Could not remove member: ${err.message}`);
    }
  };

  const removePost = async (p) => {
    if (!window.confirm("Delete this post from your club?")) return;
    try {
      await deleteDoc(doc(db, "posts", p.id));
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  };

  const removeClub = async () => {
    if (!window.confirm(`Delete “${club.name}” and all its posts? This can’t be undone.`)) return;
    setBusy(true);
    try {
      // posts first: the rules check the club while deleting them
      const snap = await getDocs(query(collection(db, "posts"), where("communityId", "==", club.id)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "communities", club.id));
    } catch (err) {
      alert(`Could not delete the club: ${err.message}`);
      setBusy(false);
    }
  };

  return (
    <div className="pf-club">
      <div className="pf-club-top">
        <div>
          <span className="pf-club-cat">{club.category}</span>
          <h4>{club.name}</h4>
          <p>{club.description || "No description yet."}</p>
        </div>
        <div className="pf-club-numbers">
          <span>👥 {members.length}</span>
          <span>📝 {clubPosts.length}</span>
        </div>
      </div>

      <div className="pf-club-actions">
        <button className={`pf-small-btn${panel === "edit" ? " on" : ""}`} onClick={() => toggle("edit")}>✏️ Edit details</button>
        <button className={`pf-small-btn${panel === "members" ? " on" : ""}`} onClick={() => toggle("members")}>👥 Members</button>
        <button className={`pf-small-btn${panel === "posts" ? " on" : ""}`} onClick={() => toggle("posts")}>📝 Posts</button>
        <button className="pf-small-btn" onClick={() => navigate("/clubs")}>Open Clubs page</button>
        <button className="pf-small-btn danger" onClick={removeClub} disabled={busy}>🗑️ Delete club</button>
      </div>

      {panel === "edit" && (
        <form className="pf-club-panel" onSubmit={save}>
          <label>Club name</label>
          <input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label>Description</label>
          <textarea value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="pf-row">
            <button className="pf-primary-btn" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            <span className="pf-msg">{msg}</span>
          </div>
        </form>
      )}

      {panel === "members" && (
        <div className="pf-club-panel">
          {members.length <= 1 && <p className="pf-muted">No other members yet. When people join your club, you can remove them here.</p>}
          {members.map((id) => (
            <div className="pf-member" key={id}>
              <span className="pf-avatar-sm">{(memberNames[id] || "V").charAt(0).toUpperCase()}</span>
              <span className="pf-member-name">{memberNames[id] || "Loading…"}{id === club.createdBy && " (you, owner)"}</span>
              {id !== club.createdBy && (
                <button className="pf-small-btn danger" onClick={() => removeMember(id)}>Remove member</button>
              )}
            </div>
          ))}
        </div>
      )}

      {panel === "posts" && (
        <div className="pf-club-panel">
          {clubPosts.length === 0 && <p className="pf-muted">No posts in this club yet.</p>}
          {clubPosts.map((p) => (
            <div className="pf-club-post" key={p.id}>
              <div>
                <strong>{p.authorName || "Volunteer"}</strong>
                <span className="pf-post-time"> · {fmtDate(toDate(p.createdAt))}</span>
                <div>{(p.content || "(photo)").slice(0, 140)}</div>
              </div>
              <button className="pf-small-btn danger" onClick={() => removePost(p)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */
export default function Profile() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const uid = user?.uid;

  const [profile, setProfile] = useState({});
  const [tab, setTab] = useState("profile");
  const [editOpen, setEditOpen] = useState(false);
  const [focusPost, setFocusPost] = useState(null); // post to scroll to on the Posts tab

  // Live data
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => setProfile(s.exists() ? s.data() : {}), console.error);
  }, [uid]);

  const myPosts = useQueryList(() => uid && query(collection(db, "posts"), where("authorId", "==", uid)), [uid]);
  const likedPosts = useQueryList(() => uid && query(collection(db, "posts"), where("likes", "array-contains", uid)), [uid]);
  const clubsJoined = useQueryList(() => uid && query(collection(db, "communities"), where("members", "array-contains", uid)), [uid]);
  const clubsCreated = useQueryList(() => uid && query(collection(db, "communities"), where("createdBy", "==", uid)), [uid]);

  const ownedIds = clubsCreated.map((c) => c.id);
  const ownedKey = ownedIds.join(",");
  const clubPosts = useQueryList(
    () => (ownedIds.length ? query(collection(db, "posts"), where("communityId", "in", ownedIds.slice(0, 30))) : null),
    [ownedKey]
  );

  const isOwner = clubsCreated.length > 0;

  // When a Recent Activity item points at a post, switch to the Posts tab,
  // scroll the post into view and flash a highlight on it.
  useEffect(() => {
    if (!focusPost) return undefined;
    let flashTimer;
    const t = setTimeout(() => {
      const el = document.getElementById(`pf-post-${focusPost}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("pf-post-highlight");
        flashTimer = setTimeout(() => el.classList.remove("pf-post-highlight"), 1800);
      }
      setFocusPost(null);
    }, 80);
    return () => {
      clearTimeout(t);
      if (flashTimer) clearTimeout(flashTimer);
    };
  }, [tab, focusPost]);

  // Favourites = posts from other people that I saved (ids live on my user document)
  const savedIds = profile.saved || [];
  const savedKey = savedIds.join(",");
  const [savedPosts, setSavedPosts] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!savedIds.length) {
      setSavedPosts([]);
      return;
    }
    Promise.all(
      [...savedIds].reverse().map(async (id) => {
        try {
          const s = await getDoc(doc(db, "posts", id));
          return s.exists() ? { id: s.id, ...s.data() } : null;
        } catch {
          return null;
        }
      })
    ).then((list) => alive && setSavedPosts(list.filter(Boolean)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const savedNameOf = useAuthorNames(savedPosts);

  // Custom badges (made by the user, saved on their user document)
  const customBadges = profile.customBadges || [];
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [badgeForm, setBadgeForm] = useState({ icon: "🏅", title: "", desc: "" });
  const [badgeMsg, setBadgeMsg] = useState("");
  const name = profile.name || user?.displayName || (user?.email || "Volunteer").split("@")[0];
  // "Club Owner of <club name>"; with several clubs: "A & B" or "A + 2 more"
  const clubNames = [...clubsCreated].sort((a, b) => millis(a.createdAt) - millis(b.createdAt)).map((c) => c.name).filter(Boolean);
  const clubLabel = clubNames.length <= 2 ? clubNames.join(" & ") : `${clubNames[0]} + ${clubNames.length - 1} more`;
  const ownerTitle = clubLabel ? `Club Owner of ${clubLabel}` : "Club Owner";
  const title = isOwner && (profile.title || "").trim() ? profile.title.trim() : isOwner ? ownerTitle : DEFAULT_TITLE;

  const stats = useMemo(() => {
    const memberDate = toDate(profile.createdAt) || (user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : null);
    return {
      memberDate,
      daysMember: memberDate ? Math.floor((Date.now() - memberDate.getTime()) / 86400000) : 0,
      posts: myPosts.length,
      photoPosts: myPosts.filter((p) => imageOf(p)).length,
      placePosts: myPosts.filter(hasPlace).length,
      clubsJoined: clubsJoined.length,
      clubsCreated: clubsCreated.length,
      likesGiven: likedPosts.length,
      likesReceived: myPosts.reduce((n, p) => n + (Array.isArray(p.likes) ? p.likes.length : 0), 0),
      profileFields: [profile.name, profile.age, profile.location, (profile.interests || []).length ? "x" : ""].filter(Boolean).length,
    };
  }, [profile, user, myPosts, likedPosts, clubsJoined, clubsCreated]);

  const earned = BADGES.filter((b) => b.value(stats) >= b.goal);
  const meta = [profile.location && `📍 ${profile.location}`, profile.age && `${profile.age} yrs`, profile.gender].filter(Boolean).join(" • ");

  const openMap = (postId) => navigate(`/events?post=${postId}`);

  const removeMyPost = async (p) => {
    if (!window.confirm("Delete this post? This can’t be undone.")) return;
    try {
      await deleteDoc(doc(db, "posts", p.id));
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  };

  const likePost = async (p) => {
    const liked = (p.likes || []).includes(uid);
    try {
      await updateDoc(doc(db, "posts", p.id), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) });
      // keep the Favourites list in step (it is loaded once, not live)
      setSavedPosts((list) =>
        list.map((x) =>
          x.id === p.id
            ? { ...x, likes: liked ? (x.likes || []).filter((i) => i !== uid) : [...(x.likes || []), uid] }
            : x
        )
      );
    } catch (err) {
      alert(`Could not update: ${err.message}`);
    }
  };

  const removeSaved = async (p) => {
    try {
      await updateDoc(doc(db, "users", uid), { saved: arrayRemove(p.id) });
    } catch (err) {
      alert(`Could not update: ${err.message}`);
    }
  };

  const addBadge = async (e) => {
    e.preventDefault();
    const title = badgeForm.title.trim();
    const desc = badgeForm.desc.trim().slice(0, 80);
    const icon = Array.from(badgeForm.icon.trim()).slice(0, 2).join("") || "🏅";
    if (title.length < 2 || title.length > 30) return setBadgeMsg("Badge name must be 2 to 30 characters.");
    if (customBadges.length >= 12) return setBadgeMsg("You can add up to 12 custom badges.");
    setBadgeMsg("Checking with Gemini…");
    const verdict = await checkText(`${title}\n${desc}`, "a badge name and description");
    if (!verdict.approved) return setBadgeMsg(`🚫 ${verdict.reason}`);
    try {
      await updateDoc(doc(db, "users", uid), {
        customBadges: arrayUnion({ id: Date.now().toString(36), icon, title, desc }),
      });
      setBadgeForm({ icon: "🏅", title: "", desc: "" });
      setBadgeMsg("");
      setBadgeOpen(false);
    } catch (err) {
      setBadgeMsg(`Error: ${err.message}`);
    }
  };

  const removeBadge = async (b) => {
    if (!window.confirm(`Remove the “${b.title}” badge?`)) return;
    try {
      await updateDoc(doc(db, "users", uid), { customBadges: customBadges.filter((x) => x.id !== b.id) });
    } catch (err) {
      alert(`Could not remove: ${err.message}`);
    }
  };

  const activity = [
    ...myPosts.map((x) => ({
      icon: "📝",
      text: `Posted: ${(x.content || "(photo)").slice(0, 80)}`,
      time: x.createdAt,
      go: () => { setTab("posts"); setFocusPost(x.id); },
    })),
    ...clubsCreated.map((x) => ({
      icon: "🏛️",
      text: `Started community: ${x.name}`,
      time: x.createdAt,
      go: () => navigate("/communities"),
    })),
  ].sort((a, b) => millis(b.time) - millis(a.time)).slice(0, 8);

  const tabs = [
    ["profile", "📇 Profile"],
    ["posts", "📝 Posts"],
    ["favourites", "⭐ Favourites"],
    ["badges", "🏆 Badges"],
    ...(isOwner ? [["owner", "👑 My Clubs"]] : []),
  ];

  const myPostsSorted = [...myPosts].sort(newest);
  const likedSorted = [...likedPosts].sort(newest);

  return (
    <div className="profile-page">
      <AppHeader active="profile" displayName={name} />

      <div className="pf-container">
        {/* ---------- Sidebar ---------- */}
        <aside className="pf-sidebar">
          <div className="pf-card pf-user">
            <div className="pf-avatar">{profile.photoURL ? <img src={profile.photoURL} alt={name} /> : name.charAt(0).toUpperCase()}</div>
            <div className="pf-name">{name}</div>
            <div className="pf-title">{isOwner && "👑 "}{title}</div>
            {meta && <div className="pf-meta">{meta}</div>}
            {profile.bio && <p className="pf-bio-side">{profile.bio}</p>}
            <button className="pf-primary-btn wide" onClick={() => setEditOpen(true)}>⚙️ Customize Profile</button>
          </div>

          <div className="pf-card pf-stats">
            <div className="pf-stat"><span className="pf-stat-icon">📅</span><div><span className="pf-stat-label">Member since</span><span className="pf-stat-value">{fmtMonth(stats.memberDate)}</span></div></div>
            <div className="pf-stat"><span className="pf-stat-icon">📝</span><div><span className="pf-stat-label">Posts</span><span className="pf-stat-value">{stats.posts}</span></div></div>
            <div className="pf-stat"><span className="pf-stat-icon">👥</span><div><span className="pf-stat-label">Communities</span><span className="pf-stat-value">{stats.clubsJoined}</span></div></div>
            <div className="pf-stat"><span className="pf-stat-icon">🏆</span><div><span className="pf-stat-label">Badges</span><span className="pf-stat-value">{earned.length} / {BADGES.length} earned</span></div></div>
          </div>
        </aside>

        {/* ---------- Main ---------- */}
        <main className="pf-main">
          <div className="pf-tabs">
            {tabs.map(([key, label]) => (
              <button key={key} className={`pf-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          <div className="pf-content">
            {tab === "profile" && (
              <>
                <h3>About me</h3>
                {profile.bio
                  ? <p className="pf-bio">{profile.bio}</p>
                  : <p className="pf-muted">You haven’t written anything yet. Click Customize Profile and tell people a little about yourself.</p>}
                <h3>Details</h3>
                <div className="pf-about">
                  <div><span className="pf-stat-label">Age</span><div className="pf-stat-value">{profile.age || "Not set"}</div></div>
                  <div><span className="pf-stat-label">Gender</span><div className="pf-stat-value">{profile.gender || "Not set"}</div></div>
                  <div><span className="pf-stat-label">Based in</span><div className="pf-stat-value">{profile.location || "Not set"}</div></div>
                  <div><span className="pf-stat-label">Title</span><div className="pf-stat-value">{title}</div></div>
                </div>
                <div className="pf-interests">
                  <span className="pf-stat-label">Interests</span>
                  <div>
                    {(profile.interests || []).length
                      ? profile.interests.map((i) => <span key={i} className="pf-chip selected">{i}</span>)
                      : <span className="pf-muted">Not set. Click Customize Profile to add some.</span>}
                  </div>
                </div>

                <h3>Recent Activity</h3>
                {activity.length ? activity.map((a, i) => (
                  <button type="button" className="pf-activity clickable" key={i} onClick={a.go} title="Open">
                    <span>{a.icon} {a.text}</span>
                    <span className="pf-post-time">{fmtDate(toDate(a.time))}</span>
                  </button>
                )) : <p className="pf-muted">No activity yet. Share a post and it will show up here.</p>}
              </>
            )}

            {tab === "posts" && (
              <>
                <div className="pf-head">
                  <h3>📝 My Posts <span className="pf-count">{myPostsSorted.length}</span></h3>
                  <button className="pf-primary-btn" onClick={() => navigate("/home")}>➕ Add Post</button>
                </div>
                <p className="pf-muted">Everything you have shared, newest first.</p>
                {myPostsSorted.length === 0 && (
                  <div className="pf-empty">You haven’t published any posts yet. Tap “Add Post” to share your first one!</div>
                )}
                <div className="pf-list">
                  {myPostsSorted.map((p) => (
                    <PostCard key={p.id} post={p} name={name} uid={uid} onLike={likePost} onOpenMap={openMap} onRemove={removeMyPost} removeLabel="🗑️ Delete" />
                  ))}
                </div>
              </>
            )}

            {tab === "favourites" && (
              <>
                <div className="pf-head">
                  <h3>⭐ Favourites <span className="pf-count">{savedPosts.length}</span></h3>
                </div>
                <p className="pf-muted">Posts from other volunteers that you saved. Tap 🔖 Save on a post in the feed to add it here.</p>
                {savedPosts.length === 0 && <div className="pf-empty">Nothing saved yet.</div>}
                <div className="pf-list">
                  {savedPosts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      name={savedNameOf(p)}
                      uid={uid}
                      onLike={likePost}
                      onOpenMap={openMap}
                      onRemove={removeSaved}
                      removeLabel="Remove from favourites"
                    />
                  ))}
                </div>
              </>
            )}

            {tab === "badges" && (
              <>
                <div className="pf-head">
                  <h3>🏆 Badges <span className="pf-count">{earned.length} / {BADGES.length}</span></h3>
                </div>
                <p className="pf-muted">Earned automatically from what you do on Pebbl.</p>
                <div className="pf-badges">
                  {BADGES.map((b) => {
                    const value = Math.min(b.value(stats), b.goal);
                    const done = value >= b.goal;
                    return (
                      <div key={b.id} className={`pf-badge${done ? "" : " locked"}`}>
                        <div className="pf-badge-icon">{b.icon}</div>
                        <div className="pf-badge-title">{b.title}</div>
                        <div className="pf-badge-desc">{b.desc}</div>
                        {!done && <div className="pf-bar"><span style={{ width: `${(value / b.goal) * 100}%` }} /></div>}
                        <div className="pf-badge-progress">{done ? "✅ Earned" : `${value} / ${b.goal}`}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="pf-head pf-section-gap">
                  <h3>🎨 My Own Badges <span className="pf-count">{customBadges.length}</span></h3>
                </div>
                <p className="pf-muted">Made by you, for things you’re proud of, like a beach clean-up or a charity run.</p>
                <div className="pf-badges">
                  {customBadges.map((b) => (
                    <div key={b.id} className="pf-badge custom">
                      <div className="pf-badge-icon">{b.icon}</div>
                      <div className="pf-badge-title">{b.title}</div>
                      {b.desc && <div className="pf-badge-desc">{b.desc}</div>}
                      <button className="pf-small-btn danger pf-badge-remove" onClick={() => removeBadge(b)}>Remove</button>
                    </div>
                  ))}
                  <button className="pf-badge add" onClick={() => setBadgeOpen((o) => !o)}>
                    <div className="pf-badge-icon">➕</div>
                    <div className="pf-badge-title">Add a badge</div>
                  </button>
                </div>

                {badgeOpen && (
                  <form className="pf-club-panel pf-badge-form" onSubmit={addBadge}>
                    <label>Pick an emoji (or type your own)</label>
                    <div className="pf-emoji-row">
                      {["🏅", "🌊", "🌳", "🐾", "🍲", "📚", "🎨", "🚑", "🏃", "💚"].map((em) => (
                        <button type="button" key={em} className={`pf-emoji${badgeForm.icon === em ? " on" : ""}`} onClick={() => setBadgeForm({ ...badgeForm, icon: em })}>{em}</button>
                      ))}
                      <input className="pf-emoji-input" value={badgeForm.icon} onChange={(e) => setBadgeForm({ ...badgeForm, icon: e.target.value })} maxLength={4} />
                    </div>
                    <label>Badge name</label>
                    <input value={badgeForm.title} maxLength={30} placeholder="e.g. Beach Clean-up 2026" onChange={(e) => setBadgeForm({ ...badgeForm, title: e.target.value })} />
                    <label>What is it for? (optional)</label>
                    <input value={badgeForm.desc} maxLength={80} placeholder="e.g. Collected 20 bags of rubbish at Morib" onChange={(e) => setBadgeForm({ ...badgeForm, desc: e.target.value })} />
                    <div className="pf-row">
                      <button className="pf-primary-btn">Add badge</button>
                      <span className="pf-msg">{badgeMsg}</span>
                    </div>
                  </form>
                )}
              </>
            )}

            {tab === "owner" && isOwner && (
              <>
                <div className="pf-head">
                  <h3>👑 My Clubs <span className="pf-count">{clubsCreated.length}</span></h3>
                </div>
                <p className="pf-muted">Clubs you started. Only you can see these tools.</p>
                <div className="pf-list">
                  {clubsCreated.map((c) => <ClubManager key={c.id} club={c} posts={clubPosts} />)}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {editOpen && (
        <EditModal
          uid={uid}
          profile={profile}
          isOwner={isOwner}
          ownerTitle={ownerTitle}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------- Profile photo helper ---------- */
// Crops to a centred square and shrinks to 256px so it stays small enough to keep on the user document.
function resizeToDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

/* ---------- Edit profile modal ---------- */
function EditModal({ uid, profile, isOwner, ownerTitle, onClose }) {
  const [form, setForm] = useState({
    name: profile.name || "",
    bio: profile.bio || "",
    title: profile.title || "",
    age: profile.age || "",
    gender: profile.gender || "",
    location: profile.location || "",
    interests: profile.interests || [],
    photo: profile.photoURL || "",
  });
  const fileRef = useRef(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const toggleInterest = (i) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(i) ? f.interests.filter((x) => x !== i) : [...f.interests, i],
    }));

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Please choose an image file.");
    if (file.size > 8 * 1024 * 1024) return setStatus("That image is too big. Pick one under 8 MB.");
    try {
      const photo = await resizeToDataUrl(file);
      setForm((f) => ({ ...f, photo }));
      setStatus("");
    } catch (err) {
      setStatus(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const title = form.title.trim();
    const age = String(form.age).trim() ? parseInt(form.age, 10) : null;

    if (name.length < 2 || name.length > 30) return setStatus("Username must be 2 to 30 characters.");
    if (age !== null && (Number.isNaN(age) || age < 1 || age > 120)) return setStatus("Enter a valid age.");
    if (title.length > 40) return setStatus("Title must be 40 characters or less.");
    if (form.bio.trim().length > 300) return setStatus("About me must be 300 characters or less.");

    setSaving(true);
    try {
      setStatus("Checking with Gemini…");
      const verdict = await checkText(
        [name, form.bio, title, form.location].join("\n"),
        "a person’s profile (username, bio, title and location)"
      );
      if (!verdict.approved) {
        setSaving(false);
        return setStatus(`🚫 ${verdict.reason}`);
      }
      if (form.photo && form.photo !== (profile.photoURL || "")) {
        setStatus("Checking your photo…");
        const photoVerdict = await checkPost({ content: "A profile picture for a volunteering community", location: "", image: form.photo });
        if (!photoVerdict.approved) {
          setSaving(false);
          return setStatus(`🚫 ${photoVerdict.reason}`);
        }
      }
      setStatus("");
      const update = {
        photoURL: form.photo,
        name,
        bio: form.bio.trim(),
        age,
        gender: form.gender,
        location: form.location.trim(),
        interests: form.interests,
        updatedAt: serverTimestamp(),
      };

      // A custom title is only for club owners. Check again on the server side.
      if (title) {
        const check = await getDocs(query(collection(db, "communities"), where("createdBy", "==", uid), limit(1)));
        if (check.empty) {
          setSaving(false);
          return setStatus("Start a community first to unlock a custom title.");
        }
        update.title = title;
      } else if (isOwner) {
        update.title = "";
      }

      await setDoc(doc(db, "users", uid), update, { merge: true });
      onClose();
    } catch (err) {
      setStatus(`Error saving profile: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="pf-overlay" onClick={onClose}>
      <form className="pf-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>Customize Profile</h3>

        <div className="pf-photo-row">
          <div className="pf-avatar pf-avatar-edit">
            {form.photo ? <img src={form.photo} alt="Profile preview" /> : (form.name || "V").charAt(0).toUpperCase()}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <button type="button" className="pf-small-btn on" onClick={() => fileRef.current?.click()}>📷 {form.photo ? "Change photo" : "Upload photo"}</button>
            {form.photo && <button type="button" className="pf-small-btn danger" style={{ marginLeft: "0.5rem" }} onClick={() => setForm((f) => ({ ...f, photo: "" }))}>Remove</button>}
            <div className="pf-hint">It is cropped to a square. JPG or PNG.</div>
          </div>
        </div>

        <label>Username</label>
        <input value={form.name} maxLength={30} onChange={set("name")} required />

        <label>About me</label>
        <textarea className="pf-bio-input" value={form.bio} maxLength={300} placeholder="Tell people a little about yourself and why you volunteer…" onChange={set("bio")} />
        <div className="pf-hint">{form.bio.length} / 300</div>

        <label>Title</label>
        <input value={form.title} maxLength={40} onChange={set("title")} disabled={!isOwner} placeholder="e.g. Creator of Bangi Volunteering" />
        <div className="pf-hint">
          {isOwner ? `Leave empty to show “${ownerTitle}”.` : "Start a community on the Clubs page to unlock a custom title."}
        </div>

        <label>Age</label>
        <input type="number" min="1" max="120" value={form.age} onChange={set("age")} />

        <label>Gender</label>
        <select value={form.gender} onChange={set("gender")}>
          <option value="">Not set</option>
          <option>Female</option>
          <option>Male</option>
          <option>Non-binary</option>
          <option>Prefer not to say</option>
        </select>

        <label>Based in</label>
        <input value={form.location} maxLength={60} onChange={set("location")} placeholder="e.g. Kajang, Selangor" />

        <label>Interests</label>
        <div>
          {INTEREST_OPTIONS.map((i) => (
            <button
              type="button"
              key={i}
              className={`pf-chip${form.interests.includes(i) ? " selected" : ""}`}
              onClick={() => toggleInterest(i)}
            >
              {i}
            </button>
          ))}
        </div>

        <div className="pf-status">{status}</div>
        <div className="pf-row">
          <button className="pf-primary-btn" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
          <button type="button" className="pf-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
