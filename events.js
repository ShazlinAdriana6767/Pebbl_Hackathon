import { db, auth } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let map;
let markers = [];

// Hardcoded GPS cache for exact local landmarks
const exactLocations = {
  "german-malaysian institute": [2.9298, 101.7801],
  "gmi": [2.9298, 101.7801],
  "jalan ilmiah, taman universiti, 43000 kajang, selangor": [2.9298, 101.7801],
  "ioi resort city": [2.9701, 101.7149],
  "ioi city mall": [2.9701, 101.7149],
  "lebuh irc, ioi resort city": [2.9701, 101.7149],
  "kajang community center": [2.9930, 101.7900],
  "stesen ktm kajang": [2.9822, 101.7905],
  "stadium kajang": [2.9939, 101.7869]
};

function initMap() {
  map = L.map('map').setView([2.9500, 101.7500], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  loadEventsFromFirestore();
}

async function getExactCoordinates(addressName) {
  const cleaned = addressName.toLowerCase().trim();

  // 1. Direct match check
  for (const key in exactLocations) {
    if (cleaned.includes(key)) {
      return exactLocations[key];
    }
  }

  // 2. Fetch from OpenStreetMap Nominatim API dynamically
  try {
    const searchQuery = cleaned.includes("malaysia") ? cleaned : `${cleaned}, Malaysia`;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
    const results = await response.json();

    if (results && results.length > 0) {
      return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    }
  } catch (error) {
    console.error("Geocoding failed for:", addressName, error);
  }

  // Default fallback near GMI
  return [2.9298, 101.7801];
}

function loadEventsFromFirestore() {
  const eventsContainer = document.getElementById("events-container");

  onSnapshot(collection(db, "events"), async (snapshot) => {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    eventsContainer.innerHTML = "";

    let activePostEventIds = new Set();
    try {
      const postsSnap = await getDocs(collection(db, "posts"));
      postsSnap.forEach(pDoc => {
        const pData = pDoc.data();
        if (pData.eventId) activePostEventIds.add(pData.eventId);
      });
    } catch(e) {
      console.warn("Could not cross-check posts collection:", e);
    }

    if (snapshot.empty) {
      eventsContainer.innerHTML = "<p style='color: #718096; font-size: 0.9rem;'>No active events on the map.</p>";
      return;
    }

    for (const docSnap of snapshot.docs) {
      const event = docSnap.data();
      const eventId = docSnap.id;

      if (activePostEventIds.size > 0 && !activePostEventIds.has(eventId)) {
        continue;
      }

      const locationName = event.locationName || event.location || "German-Malaysian Institute";

      let lat = event.lat || (event.location && event.location.lat);
      let lng = event.lng || (event.location && event.location.lng);

      if (!lat || !lng) {
        [lat, lng] = await getExactCoordinates(locationName);
      }

      let author = event.postedBy || event.authorUsername || event.authorEmail || "Adriana";
      if (author.includes("@student.gmi.edu.my") || author.includes("noorshazlin")) {
        author = "Adriana";
      } else if (author.includes("@")) {
        author = author.split("@")[0];
      }

      const title = event.title || "Volunteer Activity";
      const desc = event.description || event.content || "";

      // Add Map Marker
      const marker = L.marker([lat, lng]).addTo(map);
      
      const popupContent = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 250px; padding: 0.2rem;">
          <h4 style="margin: 0 0 0.3rem 0; color: #3B8495; font-size: 1rem; font-weight: 800;">${escapeHTML(title)}</h4>
          <p style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: #000000;">${escapeHTML(desc)}</p>
          <span style="background: #FFEBAF; color: #000000; padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: bold; font-size: 0.75rem;">📍 ${escapeHTML(locationName)}</span>
          <div style="font-size: 0.75rem; color: #718096; margin-top: 0.4rem;">Posted by: <strong>${escapeHTML(author)}</strong></div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markers.push(marker);

      // Add Sidebar Event Card
      const card = document.createElement("div");
      card.className = "event-card";
      card.innerHTML = `
        <h4>${escapeHTML(title)}</h4>
        <p>${escapeHTML(desc)}</p>
        <span class="tag">📍 ${escapeHTML(locationName)}</span>
      `;

      card.addEventListener("click", () => {
        map.setView([lat, lng], 15);
        marker.openPopup();
      });

      eventsContainer.appendChild(card);
    }
  });
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  }
});

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.onclick = () => {
    signOut(auth).then(() => window.location.href = "login.html");
  };
}

window.addEventListener("DOMContentLoaded", initMap);