// src/pages/Login.jsx
import React, { useState } from "react";
import { api } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    if (!username || !password) {
      setMsg("Bitte Benutzername und Passwort eingeben.");
      return;
    }
    try {
      setLoading(true);
      const { token } = await api.login(username, password);
      if (token) {
        localStorage.setItem("token", token);
        // Zur Startseite / Tagestour – passe ggf. deine Route an
        window.location.href = "/";
      } else {
        setMsg("Login fehlgeschlagen.");
      }
    } catch (err) {
      console.error(err);
      setMsg("Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-3 py-8">
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="text-3xl">🚚</div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#0058A3]">Anmelden</h1>
        </div>

        {msg ? (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {msg}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Benutzername</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              className="w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0058A3]/30"
              placeholder="z. B. Gehlenborg"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Passwort</label>
            <div className="flex items-stretch gap-2">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                className="flex-1 border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0058A3]/30"
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 px-4 py-3 rounded-lg border bg-gray-50 hover:bg-gray-100 text-gray-700"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0058A3] text-white rounded-lg py-3 text-base md:text-lg font-medium hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>

        <div className="mt-6 text-xs text-gray-500 leading-relaxed">
          Tipp: Du kannst diese Seite als App auf dem Handy-Homescreen speichern (Teilen →
          „Zum Home-Bildschirm“), sie funktioniert dann wie eine App.
        </div>
      </div>
    </div>
  );
}
