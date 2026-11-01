import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
  doc, updateDoc, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { checkPost } from "./geminiCheck";
import { geocode } from "./geocode";
import { useCurrentUser } from "./useCurrentUser";
import { useAuthorNames } from "./useAuthorNames";
import AppHeader from "./AppHeader";
import "./Home.css";

const MAX_IMAGE_KB = 700; // stored inside the Firestore document, which has a 1 MB limit

export default function Home() {
  const navigate = useNavigate();
  const { user, displayName } = useCurrentUser();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState({});
  const nameOf = useAuthorNames(posts);
  const [saved, setSaved] = useState([]); // ids of posts I saved (stored on my own user document)

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => setSaved(s.data()?.saved || []), console.error);
  }, [user]);

  const toggleLike = async (p) => {
    const liked = (p.likes || []).includes(user.uid);
    try {
      await updateDoc(doc(db, "posts", p.id), { likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSave = async (p) => {
    const isSaved = saved.includes(p.id);
    try {
      await updateDoc(doc(db, "users", user.uid), { saved: isSaved ? arrayRemove(p.id) : arrayUnion(p.id) });
    } catch (err) {
      console.error(err);
    }
  };

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  // Live feed
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError(err.message);
        setLoading(false);
      }
    );
  }, [user]);

  const resetForm = () => {
    setContent("");
    setLocation("");
    setImage("");
    setStatus({ type: "", text: "" });
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    resetForm();
  };

  const onPickImage = (e) => {
    const file = e.target.files[0];
    if (!file) return setImage("");
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
  };

  const submit = async () => {
    const text = content.trim();
    const place = location.trim();
    if (!text && !image) {
      return setStatus({ type: "error", text: "Please add text or select an image!" });
    }

    setBusy(true);
    try {
      setStatus({ type: "info", text: "Checking your post with Gemini…" });
      const result = await checkPost({ content: text, location: place, image });
      if (!result.approved) {
        return setStatus({ type: "error", text: `🚫 ${result.reason}` });
      }

      // Look up the exact spot once, so the Events Map can open it instantly later
      let coords = null;
      if (place) {
        setStatus({ type: "info", text: "Finding the location on the map…" });
        coords = await geocode(place);
      }

      setStatus({ type: "info", text: "Publishing…" });
      await addDoc(collection(db, "posts"), {
        authorId: user.uid,
        authorName: displayName,
        content: text,
        location: place || "General",
        lat: coords ? coords[0] : null,
        lng: coords ? coords[1] : null,
        imageUrl: image || null,
        moderationStatus: result.checked ? "approved" : "unchecked",
        createdAt: serverTimestamp(),
      });

      setOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-page">
      <AppHeader active="home" displayName={displayName} />

      <div className="main-container">
        <div className="feed-header-bar">
          <span className="feed-title">Community Feed</span>
          <button className="open-create-btn" onClick={() => setOpen(true)}>➕ Publish Post</button>
        </div>

        {loading && <p className="feed-note">Loading posts…</p>}
        {loadError && <p className="feed-note error">Couldn’t load posts: {loadError}</p>}
        {!loading && !loadError && posts.length === 0 && (
          <p className="feed-note">No volunteer posts yet. Click Publish Post to share!</p>
        )}

        <div className="feed-grid">
          {posts.map((p) => {
            const name = nameOf(p);
            const hasPlace = p.location && p.location !== "General";
            const isOpen = !!expanded[p.id];
            const liked = (p.likes || []).includes(user?.uid);
            const isMine = p.authorId === user?.uid;
            const isSaved = saved.includes(p.id);
            return (
              <article className="post-card" key={p.id}>

                <div className="card-inner">
                  <div className="post-meta">
                    <span className="avatar">{name.charAt(0).toUpperCase()}</span>
                    <div className="meta-text">
                      <strong>{name}</strong>
                      <span>
                        {p.createdAt
                          ? p.createdAt.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                          : "Just now"}
                      </span>
                    </div>
                  </div>

                  {p.content && (
                    <p
                      className={`post-text${isOpen ? " open" : ""}`}
                      onClick={() => setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))}
                      title="Click to expand or collapse"
                    >
                      {p.content}
                    </p>
                  )}
                  {p.imageUrl && <img className="post-image" src={p.imageUrl} alt="Volunteer post" />}

                  <div className="card-foot">
                    <div className="card-actions">
                      <button
                        className={`like-btn${liked ? " on" : ""}`}
                        onClick={() => toggleLike(p)}
                        title={liked ? "Unlike" : "Like"}
                      >
                        {liked ? "❤️" : "🤍"} {(p.likes || []).length}
                      </button>
                      {!isMine && (
                        <button
                          className={`save-btn${isSaved ? " on" : ""}`}
                          onClick={() => toggleSave(p)}
                          title={isSaved ? "Remove from favourites" : "Save to favourites"}
                        >
                          {isSaved ? "🔖 Saved" : "🔖 Save"}
                        </button>
                      )}
                    </div>
                    {hasPlace ? (
                      <button
                        className="location-tag"
                        title="Show on the Events Map"
                        onClick={() => navigate(`/events?post=${p.id}`)}
                      >
                        📍 {p.location}
                      </button>
                    ) : (
                      <span className="location-tag plain">📍 General</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Share a Volunteer Event or Story</h3>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What volunteer activities are happening near you?"
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="📍 Add location (e.g. Kajang Community Center)"
            />

            <label className="file-label" htmlFor="post-image">📷 Attach an Image (Optional):</label>
            <input id="post-image" type="file" accept="image/*" onChange={onPickImage} />
            {image && <img className="image-preview" src={image} alt="Preview" />}

            <p className={`status-msg ${status.type}`}>{status.text}</p>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeModal} disabled={busy}>Cancel</button>
              <button className="submit-btn" onClick={submit} disabled={busy}>
                {busy ? "Please wait…" : "Publish Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
