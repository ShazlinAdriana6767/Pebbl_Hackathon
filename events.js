import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let map;
let markers = [];
let allEvents = [];

// 1. Initialize Leaflet Map
function initMap() {
  // Center around default location (e.g., Selangor/Kajang area: 2.9935, 101.7874)
  map = L.map('map').setView([2.9935, 101.7874], 12);

  // Add Free OpenStreetMap Tile Layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  fetchEvents();
}

// 2. Fetch Events from Firestore (or load fallback data)
async function fetchEvents() {
  const eventsContainer = document.getElementById("events-container");
  eventsContainer.innerHTML = "";

  try {
    const querySnapshot = await getDocs(collection(db, "events"));
    allEvents = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      allEvents.push({ id: docSnap.id, ...data });
    });

    // Fallback test data if database returns no records during testing
    if (allEvents.length === 0) {
      allEvents = [
        {
          id: "demo1",
          title: "Kajang Community Park Cleanup",
          content: "Help us clean up trash and plant flowers in the local park!",
          category: "Environment & Nature",
          coordinates: { latitude: 2.9935, longitude: 101.7874 }
        },
        {
          id: "demo2",
          title: "Senior Care Food Drive",
          content: "Distributing food boxes and visiting elderly residents.",
          category: "Community & Elderly Care",
          coordinates: { latitude: 3.0010, longitude: 101.7950 }
        },
        {
          id: "demo3",
          title: "Community Marathon Route Marshal",
          content: "Assisting runners, directing traffic, and managing hydration stations.",
          category: "Sports & Marathons",
          coordinates: { latitude: 2.9850, longitude: 101.7750 }
        }
      ];
    }

    renderEvents(allEvents);
  } catch (error) {
    console.error("Error loading events:", error);
    eventsContainer.innerHTML = "<p>Failed to load events. Please try again.</p>";
  }
}

// 3. Render Events on Map and Sidebar
function renderEvents(events) {
  const eventsContainer = document.getElementById("events-container");
  eventsContainer.innerHTML = "";

  // Clear existing map markers
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];

  if (events.length === 0) {
    eventsContainer.innerHTML = "<p>No nearby events found for this category.</p>";
    return;
  }

  events.forEach((event) => {
    // Check latitude/longitude formatting (Firestore or raw object)
    const lat = event.coordinates?.latitude || event.location?.lat || event.lat;
    const lng = event.coordinates?.longitude || event.location?.lng || event.lng;

    if (lat && lng) {
      // Create Leaflet Marker & Popup
      const marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(`
        <div style="font-family: Arial, sans-serif;">
          <h4 style="margin: 0 0 0.4rem 0; color: #4C9DB0;">${escapeHTML(event.title || "Volunteer Event")}</h4>
          <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">${escapeHTML(event.content || event.description || "")}</p>
          <span style="background: #4C9DB0; color: white; padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.75rem;">
            ${escapeHTML(event.category || "General")}
          </span>
        </div>
      `);

      markers.push(marker);

      // Create Sidebar Event Card
      const card = document.createElement("div");
      card.className = "event-card";
      card.innerHTML = `
        <h3>${escapeHTML(event.title || "Volunteer Activity")}</h3>
        <p>${escapeHTML(event.content || event.description || "")}</p>
        <span class="tag">${escapeHTML(event.category || "General")}</span>
      `;

      // Zoom map to marker when card is clicked
      card.addEventListener("click", () => {
        map.setView([lat, lng], 15);
        marker.openPopup();
      });

      eventsContainer.appendChild(card);
    }
  });
}

// 4. Category Filtering Event Listener
document.getElementById("category-filter").addEventListener("change", (e) => {
  const selected = e.target.value;
  if (selected === "All") {
    renderEvents(allEvents);
  } else {
    const filtered = allEvents.filter(item => item.category === selected);
    renderEvents(filtered);
  }
});

// Helper function to prevent XSS attacks
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// 5. Ensure DOM is ready before initializing Leaflet Map
window.addEventListener("DOMContentLoaded", initMap);