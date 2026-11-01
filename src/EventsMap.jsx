import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { geocode } from "./geocode";
import { useCurrentUser } from "./useCurrentUser";
import { useAuthorNames } from "./useAuthorNames";
import AppHeader from "./AppHeader";
import "./EventsMap.css";

const DEFAULT_CENTER = [2.9935, 101.7874]; // Kajang / Selangor area

// Same 📍 pin as your old events page (styled by .pin-icon in EventsMap.css)
const pinIcon = L.divIcon({
  className: "pin-icon",
  html: "📍",
  iconSize: [32, 32],
  iconAnchor: [16, 30],
  popupAnchor: [0, -28],
});

const hasCoords = (p) => typeof p.lat === "number" && typeof p.lng === "number";

function titleOf(text = "") {
  const first = text.split("\n")[0].trim();
  if (!first) return "Volunteer activity";
  return first.length > 60 ? first.slice(0, 57) + "…" : first;
}

function detailOf(text = "") {
  const t = text.trim();
  const first = t.split("\n")[0].trim();
  if (t === first && t.length <= 60) return "";
  return t.length > 140 ? t.slice(0, 137) + "…" : t;
}

export default function EventsMap() {
  const { user, displayName } = useCurrentUser();
  const [params] = useSearchParams();
  const targetId = params.get("post");

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [found, setFound] = useState({}); // id -> [lat, lng] for older posts without saved coordinates
  const [map, setMap] = useState(null);

  const markerRefs = useRef({});
  const triedRef = useRef(new Set());
  const flewTo = useRef(null);
  const fitted = useRef(false);
  const nameOf = useAuthorNames(posts);

  // Live posts from Firestore
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

  // Only posts that have a real place
  const places = useMemo(
    () => posts.filter((p) => p.location && p.location !== "General"),
    [posts]
  );

  const coordsOf = (p) => (hasCoords(p) ? [p.lat, p.lng] : found[p.id] || null);
  const onMap = places.map((p) => ({ p, c: coordsOf(p) })).filter((x) => x.c);

  // Older posts have no saved coordinates: look them up one by one (OpenStreetMap allows 1 per second)
  useEffect(() => {
    let cancelled = false;
    const todo = places.filter((p) => !hasCoords(p) && !triedRef.current.has(p.id));
    if (!todo.length) return;
    (async () => {
      for (const p of todo) {
        if (cancelled) return;
        triedRef.current.add(p.id);
        try {
          const c = await geocode(p.location);
          if (c) setFound((f) => ({ ...f, [p.id]: c }));
        } catch (err) {
          console.warn("Could not find location for", p.location, err);
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [places]);

  function openPin(id) {
    setTimeout(() => markerRefs.current[id]?.openPopup(), 650);
  }

  // Arrived from a post's 📍 tag: zoom to it and open its popup (once)
  useEffect(() => {
    if (!map || !targetId || flewTo.current === targetId) return;
    const post = places.find((p) => p.id === targetId);
    const c = post && coordsOf(post);
    if (!c) return;
    flewTo.current = targetId;
    map.flyTo(c, 15);
    openPin(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, targetId, places, found]);

  // Opened normally: fit the map to all the pins (once)
  useEffect(() => {
    if (!map || targetId || fitted.current || onMap.length === 0) return;
    fitted.current = true;
    map.fitBounds(onMap.map((x) => x.c), { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, targetId, places, found]);

  function focusPost(p) {
    const c = coordsOf(p);
    if (!c || !map) return;
    map.flyTo(c, 15);
    openPin(p.id);
  }

  return (
    <div className="events-page">
      <AppHeader active="events" displayName={displayName} />

      <div className="map-container">
        <aside id="sidebar">
          <h3>📍 Nearby Volunteer Events</h3>

          {loading && <p className="map-empty">Loading events…</p>}
          {loadError && <p className="map-empty">Couldn’t load events: {loadError}</p>}
          {!loading && !loadError && places.length === 0 && (
            <p className="map-empty">
              No events with a location yet. Publish a post with a location on the Home page!
            </p>
          )}
          {places.length > 0 && onMap.length < places.length && (
            <p className="map-notice">Some posts don’t have a map pin yet.</p>
          )}

          {places.map((p) => {
            const detail = detailOf(p.content);
            return (
              <div
                key={p.id}
                className={`event-card${p.id === targetId ? " target" : ""}`}
                onClick={() => focusPost(p)}
              >
                <h4>{titleOf(p.content)}</h4>
                {detail && <p>{detail}</p>}
                <span className="tag">📍 {p.location}</span>
              </div>
            );
          })}
        </aside>

        <MapContainer id="map" ref={setMap} center={DEFAULT_CENTER} zoom={11} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {onMap.map(({ p, c }) => (
            <Marker
              key={p.id}
              position={c}
              icon={pinIcon}
              ref={(m) => {
                if (m) markerRefs.current[p.id] = m;
              }}
            >
              <Popup>
                <div className="map-popup">
                  <h4>{titleOf(p.content)}</h4>
                  <span className="popup-loc">📍 {p.location}</span>
                  <div className="popup-by">Posted by {nameOf(p)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}