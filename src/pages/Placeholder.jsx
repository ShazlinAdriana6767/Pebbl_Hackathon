import { Link, useLocation } from "react-router-dom";
import Home from "../Home";
import EventsMap from "../EventsMap";

export default function Placeholder({ title }) {
  const { pathname } = useLocation();

  // Real pages first; everything else keeps the "coming soon" screen
  if (pathname === "/home") return <Home />;
  if (pathname === "/events") return <EventsMap />;

  return (
    <div style={{ padding: "2rem", fontFamily: "'Segoe UI', sans-serif" }}>
      <h2>{title} (coming soon)</h2>
      <Link to="/login">Go to Login</Link> | <Link to="/signup">Go to Sign Up</Link>
    </div>
  );
}
