// Free geocoding with OpenStreetMap Nominatim (no Google Maps, no billing).
// Known local landmarks are answered instantly; everything else is looked up once and cached.
const EXACT = {
  "german-malaysian institute": [2.9298, 101.7801],
  "gmi": [2.9298, 101.7801],
  "jalan ilmiah, taman universiti, 43000 kajang, selangor": [2.9298, 101.7801],
  "ioi resort city": [2.9701, 101.7149],
  "ioi city mall": [2.9701, 101.7149],
  "lebuh irc, ioi resort city": [2.9701, 101.7149],
  "kajang community center": [2.993, 101.79],
  "stesen ktm kajang": [2.9822, 101.7905],
  "stadium kajang": [2.9939, 101.7869],
};

const CACHE_KEY = "pebbl-geocode-v1";
const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
};
const writeCache = (c) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
};

/** Returns [lat, lng] or null when the place can't be found. */
export async function geocode(place) {
  const q = (place || "").toLowerCase().trim();
  if (!q || q === "general") return null;

  for (const key in EXACT) if (q.includes(key)) return EXACT[key];

  const cache = readCache();
  if (q in cache) return cache[q];

  try {
    const search = q.includes("malaysia") ? q : `${q}, Malaysia`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=my&q=${encodeURIComponent(search)}`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const results = await res.json();
    const hit = results?.[0] ? [parseFloat(results[0].lat), parseFloat(results[0].lon)] : null;
    cache[q] = hit;
    writeCache(cache);
    return hit;
  } catch (err) {
    console.warn("Geocoding failed for:", place, err); // not cached, so it can be retried later
    return null;
  }
}
