// src/api.js
// Zentrale API-Schicht – sorgt dafür, dass ALLE Requests zum richtigen Backend gehen
// und der Foto-Upload exakt so gesendet wird, wie Multer es erwartet (Feldname: "foto").

const isLocal =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const BASE_URL = isLocal
  ? "http://localhost:10000"
  : "https://tourenplan.onrender.com"; // dein Backend auf Render

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJsonSafe(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(
    text && text.trim().startsWith("<")
      ? "Server-Antwort war HTML (vermutlich falsche URL oder Weiterleitung)."
      : text || `HTTP ${res.status}`
  );
}

export const api = {
  // ---- Login ----
  async login(username, password) {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Login fehlgeschlagen");
    const data = await parseJsonSafe(res);
    if (data.token) localStorage.setItem("token", data.token);
    return data;
  },

  // ---- Fahrer ----
  async listFahrer() {
    const res = await fetch(`${BASE_URL}/fahrer`, { headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Fahrer laden fehlgeschlagen");
    return parseJsonSafe(res);
  },
  async addFahrer(name) {
    const res = await fetch(`${BASE_URL}/fahrer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Fahrer konnte nicht hinzugefügt werden");
    return parseJsonSafe(res);
  },
  async deleteFahrer(id) {
    const res = await fetch(`${BASE_URL}/fahrer/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Fahrer konnte nicht gelöscht werden");
    return parseJsonSafe(res);
  },

  // ---- Touren ----
  async createTour(fahrer_id, datum) {
    const res = await fetch(`${BASE_URL}/touren`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ fahrer_id, datum }),
    });
    if (!res.ok) throw new Error("Tour konnte nicht angelegt werden");
    return parseJsonSafe(res);
  },
  async getTour(fahrer_id, datum) {
    const res = await fetch(`${BASE_URL}/touren/${fahrer_id}/${datum}`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Tour konnte nicht geladen werden");
    return parseJsonSafe(res);
  },
  async getTourenAdmin(payload) {
    const params = new URLSearchParams();
    Object.entries(payload || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    });
    const res = await fetch(`${BASE_URL}/touren-admin?${params.toString()}`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Touren (Admin) konnten nicht geladen werden");
    return parseJsonSafe(res);
  },
  async updateTour(id, body) {
    const res = await fetch(`${BASE_URL}/touren/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error("Tour konnte nicht gespeichert werden");
    return parseJsonSafe(res);
  },
  async deleteTour(id) {
    const res = await fetch(`${BASE_URL}/touren/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Tour konnte nicht gelöscht werden");
    return parseJsonSafe(res);
  },

  // ---- Stopps ----
  async getStoppsByTour(tourId) {
    const res = await fetch(`${BASE_URL}/touren/${tourId}/stopps`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Stopps konnten nicht geladen werden");
    return parseJsonSafe(res);
  },
  async createStopp(tour_id, body) {
    const res = await fetch(`${BASE_URL}/stopps/${tour_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error("Stopp konnte nicht angelegt werden");
    return parseJsonSafe(res);
  },
  async updateStopp(id, body) {
    const res = await fetch(`${BASE_URL}/stopps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error("Stopp konnte nicht gespeichert werden");
    return parseJsonSafe(res);
  },
  async deleteStopp(id) {
    const res = await fetch(`${BASE_URL}/stopps/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Stopp konnte nicht gelöscht werden");
    return parseJsonSafe(res);
  },
  async updateStoppAnmerkung(id, anmerkung_fahrer) {
    const res = await fetch(`${BASE_URL}/stopps/${id}/anmerkung`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ anmerkung_fahrer }),
    });
    if (!res.ok) throw new Error("Anmerkung konnte nicht gespeichert werden");
    return parseJsonSafe(res);
  },

  // ---- Fotos (Mehrfach, bis 3) ----
  async getStoppFotos(stoppId) {
    const res = await fetch(`${BASE_URL}/stopps/${stoppId}/fotos`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Fotos konnten nicht geladen werden");
    return parseJsonSafe(res);
  },
  async uploadStoppFoto(stoppId, file) {
    const fd = new FormData();
    fd.append("foto", file); // Feldname MUSS "foto" heißen

    const res = await fetch(`${BASE_URL}/stopps/${stoppId}/fotos`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: fd,
    });

    if (!res.ok) {
      try {
        const j = await res.json();
        throw new Error(j?.error || "Foto-Upload fehlgeschlagen");
      } catch {
        const t = await res.text();
        throw new Error(t || "Foto-Upload fehlgeschlagen");
      }
    }
    return res.json();
  },
  async deleteStoppFoto(fotoId) {
    const res = await fetch(`${BASE_URL}/stopps/fotos/${fotoId}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error("Foto konnte nicht gelöscht werden");
    return parseJsonSafe(res);
  },
};
