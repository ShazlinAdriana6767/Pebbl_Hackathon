import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { formatWhen } from "./eventTime";
import EventDetail from "./EventDetail";
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

// Cards prefer the title the person typed; older posts fall back to the first line of the text.
const cardTitle = (p) => p.title || titleOf(p.content);
const cardDetail = (p) => {
  if (!p.title) return detailOf(p.content);
  const t = (p.content || "").trim();
  return t.length > 140 ? t.slice(0, 137) + "…" : t;
};

function detailOf(text = "") {
  const t = text.trim();
  const first = t.split("\n")[0].trim();
  if (t === first && t.length <= 60) return "";
  return t.length > 140 ? t.slice(0, 137) + "…" : t;
}

export default function EventsMap() {
  const { user, displayName } = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const targetId = params.get("post");

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [found, setFound] = useState({}); // id -> [lat, lng] for older posts without saved coordinates
  const [map, setMap] = useState(null);
  const [locationSearch, setLocationSearch] = useState("");

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
  const filteredPlaces = useMemo(() => {
    const search = locationSearch.trim().toLocaleLowerCase();
    return search
      ? places.filter((p) => p.location.toLocaleLowerCase().includes(search))
      : places;
  }, [locationSearch, places]);
  const filteredOnMap = useMemo(
    () =>
      filteredPlaces
        .map((p) => ({ p, c: hasCoords(p) ? [p.lat, p.lng] : found[p.id] || null }))
        .filter((x) => x.c),
    [filteredPlaces, found]
  );

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

  useEffect(() => {
    if (!map || !locationSearch.trim() || filteredOnMap.length === 0) return;
    if (filteredOnMap.length === 1) {
      map.flyTo(filteredOnMap[0].c, 14);
    } else {
      map.fitBounds(filteredOnMap.map((x) => x.c), { padding: [40, 40], maxZoom: 14 });
    }
  }, [filteredOnMap, locationSearch, map]);

  // Open the details panel for one event (the ?post=ID in the address keeps it shareable)
  function selectEvent(p) {
    flewTo.current = p.id;
    setParams({ post: p.id }, { replace: true });
    focusPost(p);
  }

  function closeEvent() {
    setParams({}, { replace: true });
  }

  const selected = targetId ? places.find((p) => p.id === targetId) : null;

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
          {selected ? (
            <EventDetail
              key={selected.id}
              post={selected}
              user={user}
              displayName={displayName}
              hostName={nameOf(selected)}
              clubName={selected.communityName}
              coords={coordsOf(selected)}
              onBack={closeEvent}
            />
          ) : (
            <>
              <h3>📍 Nearby Volunteer Events</h3>
              <label className="location-search">
                <span>Search locations</span>
                <input
                  type="search"
                  aria-label="Search events by location"
                  value={locationSearch}
                  onChange={(event) => setLocationSearch(event.target.value)}
                  placeholder="Search by location…"
                />
              </label>

              {loading && <p className="map-empty">Loading events…</p>}
              {loadError && <p className="map-empty">Couldn’t load events: {loadError}</p>}
              {!loading && !loadError && places.length === 0 && (
                <p className="map-empty">
                  No events with a location yet. Publish a post with a location on the Home page!
                </p>
              )}
              {filteredPlaces.length > 0 &&
                filteredOnMap.length < filteredPlaces.length && (
                  <p className="map-notice">Some posts don’t have a map pin yet.</p>
              )}

              {!loading && !loadError && places.length > 0 && filteredPlaces.length === 0 && (
                <p className="map-empty">No locations match “{locationSearch}”.</p>
              )}

              {filteredPlaces.map((p) => {
                const detail = cardDetail(p);
                return (
                  <div
                    key={p.id}
                    className={`event-card${p.id === targetId ? " target" : ""}`}
                    onClick={() => selectEvent(p)}
                  >
                    <h4>{cardTitle(p)}</h4>
                    {p.eventTime && <div className="event-when">🕒 {formatWhen(p.eventTime)}</div>}
                    {detail && <p>{detail}</p>}
                    <span className="tag">📍 {p.location}</span>
                {(p.going || []).length > 0 && <span className="event-going">👥 {p.going.length} going</span>}
                  </div>
                );
              })}
            </>
          )}
        </aside>

        <MapContainer id="map" ref={setMap} center={DEFAULT_CENTER} zoom={11} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filteredOnMap.map(({ p, c }) => (
            <Marker
              key={p.id}
              position={c}
              icon={pinIcon}
              eventHandlers={{ click: () => selectEvent(p) }}
              ref={(m) => {
                if (m) markerRefs.current[p.id] = m;
              }}
            >
              <Popup>
                <div className="map-popup">
                  <h4>{cardTitle(p)}</h4>
                  {p.eventTime && <div className="popup-when">🕒 {formatWhen(p.eventTime)}</div>}
                  <span className="popup-loc">📍 {p.location}</span>
                  <div className="popup-by">Posted by {nameOf(p)}</div>
                  <button className="popup-more" onClick={() => selectEvent(p)}>See details &amp; join →</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}