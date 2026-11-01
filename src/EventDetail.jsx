import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { checkText } from "./geminiCheck";
import { useAuthorNames } from "./useAuthorNames";
import { formatWhen, googleCalendarUrl, downloadCalendarFile } from "./eventTime";
import { calendarApiConfigured, loadGoogleSignIn, requestCalendarToken, insertCalendarEvent } from "./calendarApi";
import "./EventDetail.css";

const MAX_COMMENT = 500;

const stamp = (ts) =>
  ts && typeof ts.toDate === "function"
    ? ts.toDate().toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "Just now";

const friendly = (err, what) =>
  err?.code === "permission-denied"
    ? `${what} isn’t switched on yet. Ask the project owner to update the Firestore rules.`
    : err?.message || "Something went wrong.";

// localStorage can be blocked (private mode), so never let it crash the page
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// Everything about one event: details, who is going, and the discussion thread.
export default function EventDetail({ post, user, displayName, hostName, clubName, coords, onBack }) {
  const me = user?.uid;
  const going = post.going || [];
  const iAmGoing = going.includes(me);
  const isHost = post.authorId === me;
  const when = post.eventTime ? new Date(post.eventTime) : null;
  const isPast = when && !Number.isNaN(when.getTime()) && when.getTime() < Date.now();

  const [goingBusy, setGoingBusy] = useState(false);
  const [goingError, setGoingError] = useState("");

  // "Also add it to my Google Calendar" (remembered between visits)
  const [addToCal, setAddToCal] = useState(store.get("pebbl-auto-calendar") !== "no");
  const [calMsg, setCalMsg] = useState(null); // { ok, link } or { ok:false, text }
  const calKey = `pebbl-cal-${me}-${post.id}`;

  const [comments, setComments] = useState([]);
  const [commentsError, setCommentsError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  // Warm up Google's sign-in script so the permission popup isn't blocked later
  useEffect(() => {
    if (calendarApiConfigured) loadGoogleSignIn().catch(() => {});
  }, []);

  // Live discussion thread: posts/{id}/comments
  useEffect(() => {
    setComments([]);
    setCommentsError("");
    const q = query(collection(db, "posts", post.id, "comments"), orderBy("createdAt", "asc"));
    return onSnapshot(
      q,
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error(err);
        setCommentsError(friendly(err, "The discussion"));
      }
    );
  }, [post.id]);

  const commentName = useAuthorNames(comments);
  const attendees = useMemo(() => going.map((id) => ({ authorId: id })), [going.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const attendeeName = useAuthorNames(attendees);

  const title = post.title || (post.content || "").split("\n")[0].trim() || "Volunteer activity";
  const pageUrl = `${window.location.origin}/events?post=${post.id}`;
  const calendarInfo = {
    id: post.id,
    title,
    startISO: post.eventTime,
    location: post.location,
    url: pageUrl,
    details: [post.content, `Hosted by ${hostName}`, `Details, who is going and chat: ${pageUrl}`].filter(Boolean).join("\n\n"),
  };

  async function toggleGoing() {
    setGoingBusy(true);
    setGoingError("");
    setCalMsg(null);

    // Joining + calendar enabled + upcoming event + not added before
    const wantCalendar =
      !iAmGoing && addToCal && calendarApiConfigured && post.eventTime && !isPast && !store.get(calKey);

    // Ask Google for permission first, straight from the click, so the browser doesn't block the popup
    const tokenPromise = wantCalendar ? requestCalendarToken(user?.email) : null;
    tokenPromise?.catch(() => {}); // handled below

    try {
      await updateDoc(doc(db, "posts", post.id), { going: iAmGoing ? arrayRemove(me) : arrayUnion(me) });
    } catch (err) {
      console.error(err);
      setGoingError(friendly(err, "Joining events"));
      setGoingBusy(false);
      return;
    }

    if (tokenPromise) {
      try {
        const token = await tokenPromise;
        const created = await insertCalendarEvent(token, calendarInfo);
        store.set(calKey, created.htmlLink || "1");
        setCalMsg({ ok: true, link: created.htmlLink });
      } catch (err) {
        console.error(err);
        setCalMsg({ ok: false, text: err.message });
      }
    }
    setGoingBusy(false);
  }

  async function sendComment(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX_COMMENT) return setMsg(`Please keep it under ${MAX_COMMENT} characters.`);
    setSending(true);
    setMsg("");
    try {
      const verdict = await checkText(text, "a comment on a volunteering event");
      if (!verdict.approved) return setMsg(`🚫 ${verdict.reason}`);
      await addDoc(collection(db, "posts", post.id, "comments"), {
        authorId: me,
        authorName: displayName,
        text,
        createdAt: serverTimestamp(),
      });
      setDraft("");
    } catch (err) {
      console.error(err);
      setMsg(friendly(err, "Comments"));
    } finally {
      setSending(false);
    }
  }

  async function removeComment(c) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteDoc(doc(db, "posts", post.id, "comments", c.id));
    } catch (err) {
      setMsg(friendly(err, "Deleting comments"));
    }
  }

  const googleUrl = post.eventTime ? googleCalendarUrl(calendarInfo) : "";
  const directions = coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}` : "";
  const showAutoOption = calendarApiConfigured && post.eventTime && !isPast && !iAmGoing;

  return (
    <div className="event-detail">
      <button className="ed-back" onClick={onBack}>← All events</button>

      {post.imageUrl && <img className="ed-image" src={post.imageUrl} alt="" />}

      <h3 className="ed-title">{title}</h3>
      <div className="ed-badges">
        {isPast ? <span className="ed-pill past">Past event</span> : when && <span className="ed-pill soon">Upcoming</span>}
        {clubName && <Link className="ed-pill club" to="/clubs">{clubName}</Link>}
      </div>

      <div className="ed-facts">
        {post.eventTime && <div>🕒 <strong>{formatWhen(post.eventTime)}</strong></div>}
        <div>📍 <strong>{post.location}</strong></div>
        <div>🙋 Hosted by <strong>{hostName}</strong></div>
      </div>

      <div className="ed-actions">
        {googleUrl && (
          <a className="ed-link" href={googleUrl} target="_blank" rel="noreferrer">📅 Add to Google Calendar</a>
        )}
        {googleUrl && (
          <button type="button" className="ed-link" onClick={() => downloadCalendarFile(calendarInfo)}>⬇️ .ics (Apple / Outlook)</button>
        )}
        {directions && (
          <a className="ed-link" href={directions} target="_blank" rel="noreferrer">🧭 Get directions</a>
        )}
      </div>
      {!post.eventTime && (
        <p className="ed-muted">The host hasn’t set a date and time for this event yet, so there’s nothing to add to a calendar.</p>
      )}

      {post.title && post.content && (
        <>
          <h4 className="ed-h">About this event</h4>
          <p className="ed-text">{post.content}</p>
        </>
      )}
      {!post.title && post.content && <p className="ed-text">{post.content}</p>}

      {/* ---------- Going ---------- */}
      <h4 className="ed-h">Who’s going ({going.length})</h4>

      {showAutoOption && (
        <label className="ed-cal-opt">
          <input
            type="checkbox"
            checked={addToCal}
            onChange={(e) => {
              setAddToCal(e.target.checked);
              store.set("pebbl-auto-calendar", e.target.checked ? "yes" : "no");
            }}
          />
          📅 Also add it to my Google Calendar
        </label>
      )}

      <button className={`ed-going${iAmGoing ? " on" : ""}`} onClick={toggleGoing} disabled={goingBusy}>
        {goingBusy ? "Please wait…" : iAmGoing ? "✅ I’m going (tap to cancel)" : "🙋 I’m going"}
      </button>
      {goingError && <p className="ed-error">{goingError}</p>}
      {calMsg?.ok && (
        <p className="ed-ok">
          ✅ Added to your Google Calendar. {calMsg.link && <a href={calMsg.link} target="_blank" rel="noreferrer">Open it</a>}
        </p>
      )}
      {calMsg && !calMsg.ok && (
        <p className="ed-error">
          You’re going, but the calendar step failed: {calMsg.text} You can still use the “Add to Google Calendar” button above.
        </p>
      )}
      {going.length > 0 ? (
        <div className="ed-people">
          {going.map((id) => (
            <span className="ed-person" key={id}>
              <span className="ed-avatar">{attendeeName({ authorId: id }).charAt(0).toUpperCase()}</span>
              {id === me ? "You" : attendeeName({ authorId: id })}
            </span>
          ))}
        </div>
      ) : (
        <p className="ed-muted">Nobody yet. Be the first to join!</p>
      )}

      {/* ---------- Discussion ---------- */}
      <h4 className="ed-h">Discussion ({comments.length})</h4>
      <p className="ed-muted">Ask the host a question or say hi to the others. Everyone can see this thread.</p>

      {commentsError && <p className="ed-error">{commentsError}</p>}
      {!commentsError && comments.length === 0 && <p className="ed-muted">No messages yet. Start the conversation!</p>}

      <div className="ed-thread">
        {comments.map((c) => (
          <div className="ed-comment" key={c.id}>
            <div className="ed-comment-top">
              <span>
                <strong>{commentName(c)}</strong>
                {c.authorId === post.authorId && <span className="ed-host-tag">Host</span>}
              </span>
              <span className="ed-time">{stamp(c.createdAt)}</span>
            </div>
            <div className="ed-comment-text">{c.text}</div>
            {(c.authorId === me || isHost) && (
              <button className="ed-del" onClick={() => removeComment(c)}>Delete</button>
            )}
          </div>
        ))}
      </div>

      <form className="ed-form" onSubmit={sendComment}>
        <textarea
          value={draft}
          maxLength={MAX_COMMENT}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isHost ? "Post an update for everyone going…" : "Write a message to the host and other volunteers…"}
        />
        <div className="ed-form-row">
          <span className="ed-msg">{msg}</span>
          <button className="ed-send" disabled={sending || !draft.trim()}>{sending ? "Checking…" : "Send"}</button>
        </div>
      </form>
    </div>
  );
}
