import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdditionalUserInfo, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { authErrorMessage, finishSignIn } from "../authHelpers";
import AuthHeader from "../components/AuthHeader.jsx";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await finishSignIn(credential.user, false, navigate);
    } catch (error) {
      setMessage(authErrorMessage(error.code));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setMessage("");
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const isNewUser = getAdditionalUserInfo(credential)?.isNewUser ?? false;
      await finishSignIn(credential.user, isNewUser, navigate);
    } catch (error) {
      setMessage(authErrorMessage(error.code));
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <AuthHeader />

      <div className="auth-card">
        <h2>Login to Pebbl</h2>

        <form onSubmit={handleSubmit} aria-busy={busy}>
          <input
            type="email"
            placeholder="Email Address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy}>Login</button>
        </form>

        <button className="google-btn" onClick={handleGoogle} disabled={busy}>
          Sign in with Google
        </button>

        <p className="switch-text">
          Need an account? <Link to="/signup" className="switch-link">Sign Up</Link>
        </p>
        <div className="message">{message}</div>
      </div>
    </div>
  );
}
