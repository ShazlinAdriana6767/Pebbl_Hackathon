import { Link } from "react-router-dom";

// showLogin: also show the "Log In" button (used on the sign up page)
// minimal: logo only, no buttons (used on the profile registration page)
export default function AuthHeader({ showLogin = false, minimal = false, logoTo = "/" }) {
  return (
    <header>
      <Link to={logoTo} className="logo-container">
        <img src="/we-are-volunteer-logo.png" alt="We Are Volunteer Logo" className="logo-img" />
        <span className="logo-text">Pebbl</span>
      </Link>
      {!minimal && (
        <nav className="nav-links">
          <Link to="/#about" className="nav-btn">About Us</Link>
          {showLogin && <Link to="/login" className="nav-btn">Log In</Link>}
          <Link to="/signup" className="nav-btn primary-nav-btn">Sign Up</Link>
        </nav>
      )}
    </header>
  );
}
