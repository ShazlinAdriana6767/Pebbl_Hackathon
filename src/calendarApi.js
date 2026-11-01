// Puts an event straight into the person's Google Calendar (free Google Calendar API, no backend).
// Needs a Google OAuth "Web client ID" in .env:   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
// Without it, the pages fall back to the "Add to Google Calendar" link button.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const calendarApiConfigured = Boolean(CLIENT_ID);

let scriptPromise = null;
let cached = { token: "", expiresAt: 0 };

// Load Google's sign-in script early, so the permission popup can open the moment someone taps a button
export function loadGoogleSignIn() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Could not load Google sign-in."));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Must be called straight from a click, otherwise the browser blocks the popup
export function requestCalendarToken(emailHint) {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) return reject(new Error("Google Calendar isn’t set up yet."));
    if (cached.token && Date.now() < cached.expiresAt) return resolve(cached.token);
    if (!window.google?.accounts?.oauth2) return reject(new Error("Google sign-in is still loading. Please try again."));

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      hint: emailHint || undefined,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        cached = { token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000 };
        resolve(resp.access_token);
      },
      error_callback: (err) =>
        reject(new Error(err?.type === "popup_closed" ? "Calendar permission was cancelled." : err?.message || "Calendar permission failed.")),
    });
    client.requestAccessToken();
  });
}

// Creates the event on the person's primary calendar. Returns Google's event (it has htmlLink).
export async function insertCalendarEvent(token, { title, startISO, details, location, hours = 2 }) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) throw new Error("This event has no valid start time.");
  const end = new Date(start.getTime() + hours * 3600000);

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: title,
      location: location || "",
      description: details || "",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
    }),
  });
  if (!res.ok) {
    let reason = `Google Calendar said ${res.status}.`;
    try {
      reason = (await res.json())?.error?.message || reason;
    } catch { /* keep default */ }
    throw new Error(reason);
  }
  return res.json();
}
