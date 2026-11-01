import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Returns a function nameOf(post) that gives the author's current profile name.
// Order: live profile name -> name saved on the post -> email prefix (old posts) -> "Volunteer"
export function useAuthorNames(posts) {
  const [names, setNames] = useState({});
  const asked = useRef(new Set());

  useEffect(() => {
    const ids = [...new Set(posts.map((p) => p.authorId).filter(Boolean))].filter((id) => !asked.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => asked.current.add(id));

    Promise.all(
      ids.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "users", id));
          return [id, snap.exists() ? snap.data().name : null];
        } catch {
          return [id, null];
        }
      })
    ).then((entries) => {
      const found = entries.filter(([, n]) => n);
      if (found.length) setNames((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
  }, [posts]);

  return (p) =>
    names[p.authorId] || p.authorName || (p.authorEmail ? p.authorEmail.split("@")[0] : "Volunteer");
}
