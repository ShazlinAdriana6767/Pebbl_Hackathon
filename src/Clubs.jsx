import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { checkPost } from "./geminiCheck";
import { geocode } from "./geocode";
import { splitInput, joinInput, formatWhen } from "./eventTime";
import { useCurrentUser } from "./useCurrentUser";
import { useAuthorNames } from "./useAuthorNames";
import AppHeader from "./AppHeader";
import { CLUB_CATEGORIES } from "./clubCategories";
import "./Clubs.css";

const MAX_IMAGE_KB = 600; // images are stored inside the Firestore document (1 MB limit)

/* ---------- Create a community ---------- */
function CreateClubModal({ user, displayName, onClose }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CLUB_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleanName = name.trim();
    const cleanDesc = description.trim();
    if (!cleanName) return setStatus({ type: "error", text: "Please enter a community name." });

    setBusy(true);
    try {
      setStatus({ type: "info", text: "Checking your community with Gemini…" });
      const result = await checkPost({ content: `${cleanName}\n${cleanDesc}`, location: "", image: "" });
      if (!result.approved) return setStatus({ type: "error", text: `🚫 ${result.reason}` });

      setStatus({ type: "info", text: "Creating…" });
      await addDoc(collection(db, "communities"), {
        name: cleanName,
        description: cleanDesc,
        category,
        members: [user.uid],
        createdBy: user.uid,
        ownerName: displayName,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Create a Volunteer Community</h3>
        <input
          type="text"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Community Name (e.g., Beach Cleaners Selangor)"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CLUB_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <textarea
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is your club about?"
        />
        <p className={`status-msg ${status.type}`}>{status.text}</p>
        <div className="modal-actions">
          <button className="plain-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary auto" onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : "Create Club"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Share / edit a club post ---------- */
function PostModal({ user, displayName, joinedClubs, defaultClubId, editing, onClose }) {
  const [clubId, setClubId] = useState(editing ? editing.communityId : defaultClubId || joinedClubs[0]?.id || "");
  const [title, setTitle] = useState(editing?.title || "");
  const initialWhen = splitInput(editing?.eventTime);
  const [eventDate, setEventDate] = useState(initialWhen.date);
  const [eventClock, setEventClock] = useState(initialWhen.time);
  const [content, setContent] = useState(editing?.content || "");
  const [location, setLocation] = useState(editing && editing.location !== "General" ? editing.location : "");
  const [image, setImage] = useState(editing?.imageUrl || "");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  function onPickImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      e.target.value = "";
      return setStatus({ type: "error", text: "Please select a valid image file." });
    }
    if (file.size > MAX_IMAGE_KB * 1024) {
      e.target.value = "";
      return setStatus({ type: "error", text: `⚠️ Image must be under ${MAX_IMAGE_KB} KB.` });
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImage(evt.target.result);
      setStatus({ type: "", text: "" });
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    const cleanTitle = title.trim();
    const text = content.trim();
    const place = location.trim();
    if (!clubId) return setStatus({ type: "error", text: "Pick a club to post in." });
    if (cleanTitle.length < 2) return setStatus({ type: "error", text: "Please add a title (at least 2 characters)." });
    let whenISO = null;
    if (eventDate || eventClock) {
      if (!eventDate || !eventClock) return setStatus({ type: "error", text: "Please pick both a date and a time for the event." });
      const when = joinInput(eventDate, eventClock);
      if (!when) return setStatus({ type: "error", text: "That date or time doesn’t look right. Please pick it again." });
      whenISO = when.toISOString();
    }

    setBusy(true);
    try {
      setStatus({ type: "info", text: "Checking your post with Gemini…" });
      const result = await checkPost({ content: `${cleanTitle}\n${text}`, location: place, image });
      if (!result.approved) return setStatus({ type: "error", text: `🚫 ${result.reason}` });

      // Only look the place up again if it is new or changed
      const oldPlace = editing && editing.location !== "General" ? editing.location : "";
      let lat = editing?.lat ?? null;
      let lng = editing?.lng ?? null;
      if (place && place !== oldPlace) {
        setStatus({ type: "info", text: "Finding the location on the map…" });
        const coords = await geocode(place);
        lat = coords ? coords[0] : null;
        lng = coords ? coords[1] : null;
      }
      if (!place) {
        lat = null;
        lng = null;
      }

      setStatus({ type: "info", text: "Publishing…" });
      const moderationStatus = result.checked ? "approved" : "unchecked";

      if (editing) {
        await updateDoc(doc(db, "posts", editing.id), {
          title: cleanTitle,
          eventTime: whenISO,
          content: text,
          location: place || "General",
          lat,
          lng,
          imageUrl: image || null,
          moderationStatus,
          updatedAt: serverTimestamp(),
        });
      } else {
        const club = joinedClubs.find((c) => c.id === clubId);
        await addDoc(collection(db, "posts"), {
          authorId: user.uid,
          authorName: displayName,
          title: cleanTitle,
          eventTime: whenISO,
          content: text,
          location: place || "General",
          lat,
          lng,
          imageUrl: image || null,
          communityId: clubId,
          communityName: club?.name || "",
          moderationStatus,
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{editing ? "Edit Post / Event" : "Share an Activity or Event"}</h3>

        <label className="field-label" htmlFor="post-club">Post in club</label>
        <select id="post-club" value={clubId} onChange={(e) => setClubId(e.target.value)} disabled={!!editing}>
          {editing && !joinedClubs.some((c) => c.id === clubId) && (
            <option value={clubId}>{editing.communityName || "This club"}</option>
          )}
          {joinedClubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label className="field-label" htmlFor="post-title">Title</label>
        <input
          id="post-title"
          type="text"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Beach Clean-up at Morib"
        />

        <label className="field-label" htmlFor="post-date">Date and time</label>
        <div className="when-row">
          <input id="post-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          <input id="post-time" type="time" aria-label="Time" value={eventClock} onChange={(e) => setEventClock(e.target.value)} />
        </div>
        <p className="hint">Optional. Pick the date and the time if this is an event.</p>

        <label className="field-label" htmlFor="post-details">Details</label>
        <textarea
          id="post-details"
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What’s happening? Who should come, what to bring, where to meet…"
        />

        <label className="field-label" htmlFor="club-post-image">Attach Photo</label>
        <input id="club-post-image" type="file" accept="image/*" onChange={onPickImage} />
        {image && <img className="image-preview" src={image} alt="Preview" />}

        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Event Location (e.g., German-Malaysian Institute)"
        />
        <p className="hint">Adding a location will automatically show this post on the Events Map.</p>

        <p className={`status-msg ${status.type}`}>{status.text}</p>
        <div className="modal-actions">
          <button className="plain-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary auto" onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : editing ? "Update" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- The page ---------- */
export default function Clubs() {
  const navigate = useNavigate();
  const { user, displayName } = useCurrentUser();

  const [clubs, setClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  const [tab, setTab] = useState("discover"); // discover | myclubs
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [feedFilter, setFeedFilter] = useState("all"); // all | mine | a club id
  const [busyClub, setBusyClub] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [lightbox, setLightbox] = useState("");

  const myId = user?.uid;

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "communities"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setClubs(list);
        setClubsLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError(err.message);
        setClubsLoading(false);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.communityId));
        setPostsLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError(err.message);
        setPostsLoading(false);
      }
    );
  }, [user]);

  const nameOf = useAuthorNames(posts);

  const isMember = (c) => (c.members || []).includes(myId);
  const isOwner = (c) => c.createdBy === myId;
  const myClubs = clubs.filter(isMember);
  const clubById = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);

  const shownClubs = clubs.filter((c) => {
    if (tab === "myclubs" && !isMember(c)) return false;
    if (catFilter !== "All" && c.category !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.category, c.description].some((v) => (v || "").toLowerCase().includes(q));
  });

  const feed = posts.filter((p) => {
    if (feedFilter === "all") return true;
    if (feedFilter === "mine") {
      const club = clubById[p.communityId];
      return myClubs.some((c) => c.id === p.communityId) || (club && isOwner(club));
    }
    return p.communityId === feedFilter;
  });

  async function toggleJoin(club) {
    if (isOwner(club)) return;
    setBusyClub(club.id);
    setNotice("");
    try {
      await updateDoc(doc(db, "communities", club.id), {
        members: isMember(club) ? arrayRemove(myId) : arrayUnion(myId),
      });
    } catch (err) {
      console.error(err);
      setNotice(`Couldn’t update membership: ${err.message}`);
    } finally {
      setBusyClub("");
    }
  }

  async function removePost(p) {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, "posts", p.id));
    } catch (err) {
      console.error(err);
      setNotice(`Couldn’t delete the post: ${err.message}`);
    }
  }

  function openShare() {
    setEditingPost(null);
    setPostOpen(true);
  }

  function openEdit(p) {
    setEditingPost(p);
    setPostOpen(true);
  }

  const defaultClubId = !["all", "mine"].includes(feedFilter) && isMember(clubById[feedFilter] || {}) ? feedFilter : "";

  return (
    <div className="clubs-page">
      <AppHeader active="clubs" displayName={displayName} />

      <div className="container">
        {/* Left column: club activity */}
        <div>
          <div className="card">
            <div className="card-row">
              <h2 className="card-title">Community Activity</h2>
              <button
                className="btn-primary auto"
                onClick={openShare}
                disabled={myClubs.length === 0}
                title={myClubs.length === 0 ? "Join a club first" : ""}
              >
                Share Post / Event
              </button>
            </div>
            <div className="card-row filter-row">
              <label htmlFor="feed-filter">Show:</label>
              <select id="feed-filter" value={feedFilter} onChange={(e) => setFeedFilter(e.target.value)}>
                <option value="all">All clubs</option>
                <option value="mine">My clubs only</option>
              </select>
            </div>
            {myClubs.length === 0 && !clubsLoading && (
              <p className="hint">Join a club on the right to start sharing posts and events.</p>
            )}
          </div>

          {notice && <p className="status-msg error">{notice}</p>}
          {loadError && <p className="empty-note error">Couldn’t load data: {loadError}</p>}
          {postsLoading && <p className="empty-note">Loading activity...</p>}
          {!postsLoading && !loadError && feed.length === 0 && (
            <p className="empty-note">No activity shared yet. Join a club and be the first to post!</p>
          )}

          {feed.map((p) => {
            const club = clubById[p.communityId];
            const hasPlace = p.location && p.location !== "General";
            const iAmAuthor = p.authorId === myId;
            const iOwnClub = club && isOwner(club);
            return (
              <article className="post-card" key={p.id}>
                <div className="post-top">
                  <div className="post-who">
                    <span className="post-author">{nameOf(p)}</span>
                    <button className="club-chip" onClick={() => setFeedFilter(p.communityId)} title="Show only this club">
                      {club?.name || p.communityName || "Club"}
                    </button>
                  </div>
                  {(iAmAuthor || iOwnClub) && (
                    <div className="action-btn-group">
                      {iAmAuthor && <button className="edit-btn" onClick={() => openEdit(p)}>Edit</button>}
                      <button className="delete-btn" onClick={() => removePost(p)}>
                        {iAmAuthor ? "Delete" : "Remove"}
                      </button>
                    </div>
                  )}
                </div>

                {p.title && <h4 className="post-title">{p.title}</h4>}
                {p.eventTime && <div className="post-when">🕒 {formatWhen(p.eventTime)}</div>}
                {p.content && <p className="post-text">{p.content}</p>}
                {p.imageUrl && (
                  <div className="post-img-container" onClick={() => setLightbox(p.imageUrl)}>
                    <img src={p.imageUrl} alt="Uploaded photo" loading="lazy" />
                  </div>
                )}
                {hasPlace && (
                  <div className="post-foot">
                    <button className="location-tag" onClick={() => navigate(`/events?post=${p.id}`)}>
                      📍 {p.location}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Right column: clubs */}
        <div>
          <div className="card">
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create a Community</button>
          </div>

          <div className="card">
            <div className="tab-bar">
              <button className={`tab-btn${tab === "discover" ? " active" : ""}`} onClick={() => setTab("discover")}>
                Discover
              </button>
              <button className={`tab-btn${tab === "myclubs" ? " active" : ""}`} onClick={() => setTab("myclubs")}>
                My Clubs
              </button>
            </div>

            <input
              type="text"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search clubs"
            />
            <select className="cat-select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="All">All categories</option>
              {CLUB_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {clubsLoading && <p className="empty-note small">Loading communities...</p>}
            {!clubsLoading && shownClubs.length === 0 && (
              <p className="empty-note small">
                {tab === "myclubs" ? "You haven’t joined any clubs yet." : "No communities found."}
              </p>
            )}

            {shownClubs.map((club) => {
              const count = (club.members || []).length;
              const mine = isMember(club);
              const owner = isOwner(club);
              return (
                <div className={`club-row${feedFilter === club.id ? " selected" : ""}`} key={club.id}>
                  <div className="club-info">
                    <button className="club-name" onClick={() => setFeedFilter(club.id)} title="Show this club’s activity">
                      {club.name || "Community"}
                    </button>
                    <span className="club-meta">
                      {club.category || "General"} • {count} member{count === 1 ? "" : "s"}
                    </span>
                    {club.description && <span className="club-desc">{club.description}</span>}
                  </div>
                  {owner ? (
                    <div className="owner-box">
                      <span className="owner-badge">👑 Owner</span>
                      <Link className="manage-link" to="/profile?tab=clubs">Manage</Link>
                    </div>
                  ) : (
                    <button
                      className={`join-btn${mine ? " joined" : ""}`}
                      onClick={() => toggleJoin(club)}
                      disabled={busyClub === club.id}
                      title={mine ? "Click to leave this club" : ""}
                    >
                      {mine ? "Joined" : "Join"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {createOpen && <CreateClubModal user={user} displayName={displayName} onClose={() => setCreateOpen(false)} />}

      {postOpen && (
        <PostModal
          user={user}
          displayName={displayName}
          joinedClubs={myClubs}
          defaultClubId={defaultClubId}
          editing={editingPost}
          onClose={() => {
            setPostOpen(false);
            setEditingPost(null);
          }}
        />
      )}

      {lightbox && (
        <div id="image-lightbox" onClick={() => setLightbox("")}>
          <span className="lightbox-close">&times;</span>
          <img src={lightbox} alt="Full size preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
