import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// Logged-in guard + profile name. Sends people to login / profile registration when needed.
export function useCurrentUser() {
  const navigate = useNavigate();
  const [state, setState] = useState({ user: null, displayName: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return navigate("/login", { replace: true });
      const fallback = (u.email || "Volunteer").split("@")[0];
      let displayName = fallback;
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (!snap.exists()) return navigate("/profile-register", { replace: true });
        displayName = snap.data().name || fallback;
      } catch (err) {
        console.error(err);
      }
      setState({ user: u, displayName });
    });
    return unsub;
  }, [navigate]);

  return state;
}
