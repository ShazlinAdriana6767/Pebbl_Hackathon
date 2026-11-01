import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import "./navbar.css";

const LINKS = [
  { key: "home", path: "/home", label: "Home" },
  { key: "events", path: "/events", label: "📍 Events Map" },
  { key: "communities", path: "/communities", label: "Clubs" },
  { key: "profile", path: "/profile", label: "My Profile" },
];

export default function AppHeader({ active, displayName }) {
  const navigate = useNavigate();
  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };
  const logout = () => signOut(auth).then(() => navigate("/"));

  return (
    <header>
      <a href="/home" onClick={go("/home")} className="logo-container">
        <img src="/we-are-volunteer-logo.png" alt="Logo" className="logo-img" />
        <span className="logo-text">Pebbl</span>
      </a>
      <nav className="nav-links">
        {displayName && <span className="user-greeting">Hello, {displayName}!</span>}
        {LINKS.map((l) => (
          <a key={l.key} href={l.path} onClick={go(l.path)} className={`nav-btn${active === l.key ? " active" : ""}`}>
            {l.label}
          </a>
        ))}
        {active === "profile" && <button className="logout-btn" onClick={logout}>Log Out</button>}
      </nav>
    </header>
  );
}
