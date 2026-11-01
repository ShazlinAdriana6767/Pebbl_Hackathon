// Event time helpers. The time is stored on the post as an ISO string (e.g. "2026-11-05T01:00:00.000Z").

const pad = (n) => String(n).padStart(2, "0");

// ISO string -> { date: "2026-11-05", time: "09:00" } for the date and time inputs (the person's own time zone)
export function splitInput(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// "2026-11-05" + "09:00" -> Date (or null if it isn't a real date)
export function joinInput(date, time) {
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ISO string -> "Sat, 5 Nov 2026, 9:00 am"
export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ---------- Add to calendar ---------- */
// Events have a start time only, so calendars get a 2 hour slot.
const DEFAULT_HOURS = 2;
const calStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261115T010000Z

// Opens Google Calendar with the event already filled in. No sign-in or API key needed on our side.
export function googleCalendarUrl({ title, startISO, details, location }) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + DEFAULT_HOURS * 3600000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${calStamp(start)}/${calStamp(end)}`,
    details: details || "",
    location: location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const icsEscape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

// Downloads a .ics file (works with Apple Calendar, Outlook and others)
export function downloadCalendarFile({ id, title, startISO, details, location, url }) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + DEFAULT_HOURS * 3600000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pebbl//Volunteer Events//EN",
    "BEGIN:VEVENT",
    `UID:${id}@pebbl`,
    `DTSTAMP:${calStamp(new Date())}`,
    `DTSTART:${calStamp(start)}`,
    `DTEND:${calStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(details)}`,
    `LOCATION:${icsEscape(location)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${(title || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
