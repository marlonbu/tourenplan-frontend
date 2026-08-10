// src/App.jsx
import React, { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Planung from "./pages/Planung";
import Tagestour from "./pages/Tagestour";
import Uebersicht from "./pages/Uebersicht";
import Tourverwaltung from "./pages/Tourverwaltung";
import Login from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";
import { api, AUTH_STATE_EVENT } from "./api";

const MAX_TIMEOUT_MS = 2147483647;

export default function App() {
  const [session, setSession] = useState(() => api.getSessionStatus());

  const handleLoginSuccess = () => {
    setSession(api.getSessionStatus());
  };

  useEffect(() => {
    const synchronizeSession = (event) => {
      const currentSession = api.getSessionStatus();
      const eventMessage = event?.detail?.message || "";

      setSession({
        ...currentSession,
        message: eventMessage || currentSession.message || "",
      });
    };

    const handleStorageChange = (event) => {
      if (event.key === null || event.key === "token") {
        synchronizeSession();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        synchronizeSession();
      }
    };

    window.addEventListener(AUTH_STATE_EVENT, synchronizeSession);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", synchronizeSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, synchronizeSession);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", synchronizeSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.expiresAt) return undefined;

    const remainingTime = session.expiresAt - Date.now();

    if (remainingTime <= 0) {
      api.expireSession();
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      api.expireSession();
    }, Math.min(remainingTime + 100, MAX_TIMEOUT_MS));

    return () => window.clearTimeout(timeoutId);
  }, [session.authenticated, session.expiresAt]);

  if (!session.authenticated) {
    return <Login initialMessage={session.message} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Planung />} />
        <Route path="/tagestour" element={<Tagestour />} />
        <Route path="/gesamtuebersicht" element={<Uebersicht />} />
        <Route path="/tourverwaltung" element={<Tourverwaltung />} />
        <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        <Route path="*" element={<Planung />} />
      </Routes>
    </DashboardLayout>
  );
}
