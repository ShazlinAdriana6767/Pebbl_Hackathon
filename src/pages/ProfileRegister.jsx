import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthHeader from "../components/AuthHeader.jsx";
import "./ProfileRegister.css";

export default function ProfileRegister() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [interest, setInterest] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Make sure the user is logged in. If not, send them to the login page.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        navigate("/login");
      }
    });
    return unsubscribe;
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name: fullName.trim(),
        age: parseInt(age.trim(), 10),
        gender,
        interests: [interest],
        updatedAt: new Date(),
      });
      navigate("/home");
    } catch (error) {
      setMessage(`Error saving profile: ${error.message}`);
      setSaving(false);
    }
  }

  return (
    <div className="register-page">
      <AuthHeader minimal logoTo="/home" />

      <div className="profile-card">
        <h2>Complete Your Profile</h2>
        <p>Tell us a bit about yourself to personalize your volunteer experience!</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="full-name">Full Name</label>
          <input
            type="text"
            id="full-name"
            placeholder="e.g. Alex Tan"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <label htmlFor="age">Age</label>
          <input
            type="number"
            id="age"
            min="10"
            max="100"
            placeholder="e.g. 21"
            required
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />

          <label htmlFor="gender">Gender</label>
          <select id="gender" required value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="" disabled>Select gender</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>

          <label htmlFor="interests">Primary Volunteering Interest</label>
          <select id="interests" required value={interest} onChange={(e) => setInterest(e.target.value)}>
            <option value="" disabled>Select primary interest</option>
            <option value="Sports & Marathons">Sports &amp; Marathons</option>
            <option value="Environment & Nature">Environment &amp; Nature</option>
            <option value="Animal Welfare">Animal Welfare</option>
            <option value="Community & Elderly Care">Community &amp; Elderly Care</option>
            <option value="Education & Youth">Education &amp; Youth</option>
            <option value="Disaster Relief & First Aid">Disaster Relief &amp; First Aid</option>
            <option value="Arts & Cultural Events">Arts &amp; Cultural Events</option>
            <option value="Others">Others</option>
          </select>

          <button type="submit" disabled={saving}>
            {saving ? "Saving Profile..." : "Save Profile & Continue"}
          </button>
        </form>

        <div className="message">{message}</div>
      </div>
    </div>
  );
}
