// src/api.js
// Zentrale API-Hilfsfunktionen für Tourenplan-Frontend
// ⚙️ Erkennt automatisch Umgebung (Render / Lokal) und ruft IMMER das Backend unter der korrekten Domain auf.

const BACKEND_URL =
  window.location.hostname.includes("render")
    ? "https://tourenplan.onrender.com" // deine Backend-App auf Render
    : "http://localhost:10000";          // lokal

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// JSON-Wrapper mit robuster HTML-Erkennung (z. B. wenn falsche Domain antwortet)
async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  // Versuche JSON zu parsen; wenn es HTML ist (z. B. <!DOCTYPE ...>), klare Fehlermeldung
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      console.error("❌ Unerwartete (nicht-JSON) Antwort:", text.slice(0, 200));
      throw new Error("Server-Antwort war ungültig (kein JSON). Prüfe BACKEND_URL.");
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Fehler ${res.status}`);
  }
  return data;
}

export const api = {
  // ===== Fahrer =====
  async listFahrer() {
    return jsonFetch(`${BACKEND_URL}/fahrer`, { headers: authHeaders() });
  },
  async addFahrer(name) {
    return jsonFetch(`${BACKEND_URL}/fahrer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name }),
    });
  },
  async deleteFahrer(id) {
    return jsonFetch(`${BACKEND_URL}/fahrer/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  // ===== Touren (Planung / Tagestour) =====
  async createTour(fahrer_id, datum) {
    return jsonFetch(`${BACKEND_URL}/touren`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ fahrer_id, datum }),
    });
  },
  async getTour(fahrerId, datum) {
    return jsonFetch(`${BACKEND_URL}/touren/${fahrerId}/${datum}`, {
      headers: authHeaders(),
    });
  },

  // ===== Tourverwaltung – Liste & Details =====
  async getTourenAdmin(filters = {}) {
    const params = new URLSearchParams();
    if (filters.fahrer_id) params.set("fahrer_id", filters.fahrer_id);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.kw) params.set("kw", filters.kw);
    if (filters.kunde) params.set("kunde", filters.kunde);
    const q = params.toString();
    const url = `${BACKEND_URL}/touren-admin${q ? `?${q}` : ""}`;
    return jsonFetch(url, { headers: authHeaders() });
  },
  async getStoppsByTour(tourId) {
    return jsonFetch(`${BACKEND_URL}/touren/${tourId}/stopps`, {
      headers: authHeaders(),
    });
  },
  async updateTour(tourId, payload) {
    // Server hat PATCH /touren/:id nicht – in deiner App wird aktuell nur
    // /touren-admin gelesen und die Tour in der Liste per updateTour(tid, payload) gespeichert.
    // Falls du später eine eigene Tour-Update-Route baust, ergänzen.
    // Hier deshalb explizit Fehler geben, wenn jemals aufgerufen:
    throw new Error("updateTour ist serverseitig (noch) nicht implementiert.");
  },
  async deleteTour(tourId) {
    // Ebenso: In deinem aktuellen server.js gibt es kein DELETE /touren/:id.
    // Falls das bei dir bereits existiert, kannst du es hier aktivieren:
    // return jsonFetch(`${BACKEND_URL}/touren/${tourId}`, { method: "DELETE", headers: authHeaders() });
    throw new Error("deleteTour ist serverseitig (noch) nicht implementiert.");
  },

  // ===== Stopps =====
  async createStopp(tour_id, stopp) {
    return jsonFetch(`${BACKEND_URL}/stopps/${tour_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(stopp),
    });
  },
  async updateStopp(id, data) {
    return jsonFetch(`${BACKEND_URL}/stopps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
  },
  async updateStoppAnmerkung(id, anmerkung_fahrer) {
    return jsonFetch(`${BACKEND_URL}/stopps/${id}/anmerkung`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ anmerkung_fahrer }),
    });
  },
  async deleteStopp(id) {
    return jsonFetch(`${BACKEND_URL}/stopps/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  // ===== Fotos – Single (bestehend) =====
  async uploadSingleFoto(stoppId, file) {
    const fd = new FormData();
    fd.append("foto", file); // Feldname MUSS "foto" heißen -> multer.single("foto")
    const res = await fetch(`${BACKEND_URL}/stopps/${stoppId}/foto`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) {
      // Versuche Fehler aus JSON zu ziehen, sonst Text anzeigen
      try {
        const j = JSON.parse(text);
        throw new Error(j?.error || "Fehler beim Foto-Upload");
      } catch {
        throw new Error(text || "Fehler beim Foto-Upload");
      }
    }
    return JSON.parse(text);
  },
  async deleteSingleFoto(stoppId) {
    return jsonFetch(`${BACKEND_URL}/stopps/${stoppId}/foto`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },

  // ===== Fotos – Mehrfach (NEU, bis 3/Stopp) =====
  async listFotos(stoppId) {
    return jsonFetch(`${BACKEND_URL}/stopps/${stoppId}/fotos`, {
      headers: authHeaders(),
    });
  },
  async uploadFoto(stoppId, file) {
    const fd = new FormData();
    fd.append("foto", file); // Feldname MUSS "foto" heißen -> multer.single("foto")
    const res = await fetch(`${BACKEND_URL}/stopps/${stoppId}/fotos`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) {
      try {
        const j = JSON.parse(text);
        throw new Error(j?.error || "Fehler beim Foto-Upload");
      } catch {
        throw new Error(text || "Fehler beim Foto-Upload");
      }
    }
    return JSON.parse(text);
  },
  async deleteFoto(fotoId) {
    return jsonFetch(`${BACKEND_URL}/stopps/fotos/${fotoId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  },
};
