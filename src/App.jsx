import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ProfileRegister from "./pages/ProfileRegister.jsx";
import Landing from "./Landing";
import Home from "./Home";
import EventsMap from "./EventsMap";
import Clubs from "./Clubs";
import Profile from "./Profile";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/landing" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/profile-register" element={<ProfileRegister />} />
      <Route path="/home" element={<Home />} />
      <Route path="/events" element={<EventsMap />} />
      <Route path="/clubs" element={<Clubs />} />
      <Route path="/communities" element={<Clubs />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  );
}