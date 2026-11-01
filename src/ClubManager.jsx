import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { checkPost } from "./geminiCheck";
import { useCurrentUser } from "./useCurrentUser";
import { CLUB_CATEGORIES } from "./clubCategories";
import "./ClubManager.css";

/* Clubs this user created (they are the "author" / owner of these) */
export function useOwnedClubs(uid) {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "communities"), where("createdBy", "==", uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setClubs(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
  }, [uid]);

  return { clubs, loading };
}

/* uid -> display name, for the member list */
function useUserNames(uids) {
  const [names, setNames] = useState({});
  const key = uids.join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            const d = snap.exists() ? snap.data() : {};
            return [uid, d.name || d.username || (d.email || "").split("@")[0] || "Volunteer"];
          } catch {
            return [uid, "Volunteer"];
          }
        })
      );
      if (alive) setNames(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}

function formatDate(ts) {
  return ts?.toDate
    ? ts.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "Just now";
}

/* One club's management panel */
function ClubPanel({ club, myId }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(club.name || "");
  const [category, setCategory] = useState(club.category || CLUB_CATEGORIES[0]);
  const [description, setDescription] = useState(club.description || "");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState([]);

  const members = club.members || [];
  const names = useUserNames(open ? members : []);

  // Only listen to this club's posts while the panel is open
  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, "posts"), where("communityId", "==", club.id));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPosts(list);
    });
  }, [open, club.id]);

  const categoryOptions = CLUB_CATEGORIES.includes(category) ? CLUB_CATEGORIES : [category, ...CLUB_CATEGORIES];

  async function saveDetails() {
    const cleanName = name.trim();
    const cleanDesc = description.trim();
    if (!cleanName) return setStatus({ type: "error", text: "The club needs a name." });

    setBusy(true);
    try {
      const changedText = cleanName !== (club.name || "") || cleanDesc !== (club.description || "");
      if (changedText) {
        setStatus({ type: "info", text: "Checking with Gemini…" });
        const result = await checkPost({ content: `${cleanName}\n${cleanDesc}`, location: "", image: "" });
        if (!result.approved) return setStatus({ type: "error", text: `🚫 ${result.reason}` });
      }
      await updateDoc(doc(db, "communities", club.id), {
        name: cleanName,
        category,
        description: cleanDesc,
        updatedAt: serverTimestamp(),
      });
      setStatus({ type: "ok", text: "✅ Saved!" });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(uid) {
    if (!window.confirm(`Remove ${names[uid] || "this member"} from ${club.name}?`)) return;
    try {
      await updateDoc(doc(db, "communities", club.id), { members: arrayRemove(uid) });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Couldn’t remove the member: ${err.message}` });
    }
  }

  async function removePost(p) {
    if (!window.confirm("Delete this post from your club?")) return;
    try {
      await deleteDoc(doc(db, "posts", p.id));
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Couldn’t delete the post: ${err.message}` });
    }
  }

  async function deleteClub() {
    const typed = window.prompt(
      `This permanently deletes "${club.name}" and all of its posts.\n\nType the club name to confirm:`
    );
    if (typed === null) return;
    if (typed.trim() !== (club.name || "").trim()) {
      return setStatus({ type: "error", text: "The name didn’t match, so nothing was deleted." });
    }

    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "posts"), where("communityId", "==", club.id)));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, "communities", club.id));
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: `Couldn’t delete the club: ${err.message}` });
      setBusy(false);
    }
  }

  return (
    <div className="club-panel">
      <button className="panel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div>
          <strong>{club.name}</strong>
          <span>
            {club.category || "General"} • {members.length} member{members.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="chev">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="panel-body">
          <section>
            <h4>Club details</h4>
            <label htmlFor={`name-${club.id}`}>Name</label>
            <input id={`name-${club.id}`} type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <label htmlFor={`cat-${club.id}`}>Category</label>
            <select id={`cat-${club.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label htmlFor={`desc-${club.id}`}>Description</label>
            <textarea id={`desc-${club.id}`} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
            <button className="save-btn" onClick={saveDetails} disabled={busy}>
              {busy ? "Please wait…" : "Save changes"}
            </button>
            <p className={`status-msg ${status.type}`}>{status.text}</p>
          </section>

          <section>
            <h4>Members ({members.length})</h4>
            <ul className="member-list">
              {members.map((uid) => (
                <li key={uid}>
                  <span>
                    {names[uid] || "…"}
                    {uid === myId && <em className="you-badge">👑 You (owner)</em>}
                  </span>
                  {uid !== myId && (
                    <button className="danger-link" onClick={() => removeMember(uid)}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Club posts ({posts.length})</h4>
            {posts.length === 0 && <p className="muted">No posts in this club yet.</p>}
            <ul className="post-list">
              {posts.map((p) => (
                <li key={p.id}>
                  <div>
                    <p>{(p.content || "(photo only)").slice(0, 140)}</p>
                    <span>{p.authorName || "Volunteer"} • {formatDate(p.createdAt)}</span>
                  </div>
                  <button className="danger-link" onClick={() => removePost(p)}>Delete</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="danger-zone">
            <h4>Danger zone</h4>
            <p className="muted">Deleting a club removes it and every post inside it. This can’t be undone.</p>
            <button className="delete-club-btn" onClick={deleteClub} disabled={busy}>Delete this club</button>
          </section>
        </div>
      )}
    </div>
  );
}

/* The "Manage My Clubs" section for the profile page */
export default function ClubManager() {
  const { user } = useCurrentUser();
  const { clubs, loading } = useOwnedClubs(user?.uid);

  return (
    <section className="club-manager" id="my-clubs">
      <div className="manager-title">
        <h3>🛠️ Manage My Clubs</h3>
        <span className="owner-tag">Club owner</span>
      </div>

      {loading && <p className="muted">Loading your clubs…</p>}

      {!loading && clubs.length === 0 && (
        <p className="muted">
          You haven’t created a club yet. Create one on the <Link to="/clubs">Clubs page</Link> and your owner tools will
          appear here.
        </p>
      )}

      {clubs.map((club) => (
        <ClubPanel key={club.id} club={club} myId={user?.uid} />
      ))}
    </section>
  );
}
