import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Planung() {
  const [fahrer, setFahrer] = useState([]);
  const [selectedFahrer, setSelectedFahrer] = useState("");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [tour, setTour] = useState(null);
  const [stopps, setStopps] = useState([]);

  // Felder für neuen Stopp (inkl. ANKUNFT)
  const [neuStopp, setNeuStopp] = useState({
    kunde: "",
    adresse: "",
    telefon: "",
    kommission: "",
    hinweis: "",
    position: "",
    ankunft: "", // <— NEU: frei beschreibbares Feld
  });

  const [msg, setMsg] = useState("");

  useEffect(() => {
    ladeFahrer();
  }, []);

  async function ladeFahrer() {
    try {
      const data = await api.listFahrer();
      setFahrer(data);
    } catch (err) {
      console.error("Fehler beim Laden der Fahrer:", err);
      setMsg("❌ Fehler beim Laden der Fahrer");
    }
  }

  async function addFahrer() {
    const name = prompt("Name des neuen Fahrers:");
    if (!name) return;
    try {
      await api.addFahrer(name);
      ladeFahrer();
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Fahrer konnte nicht hinzugefügt werden");
    }
  }

  async function deleteFahrer(id) {
    if (!window.confirm("Fahrer wirklich löschen?")) return;
    try {
      await api.deleteFahrer(id);
      ladeFahrer();
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Fahrer konnte nicht gelöscht werden");
    }
  }

  async function anlegenTour() {
    if (!selectedFahrer || !datum) {
      alert("Bitte Fahrer und Datum auswählen!");
      return;
    }
    try {
      const t = await api.createTour(selectedFahrer, datum);
      setTour(t);
      setStopps([]);
      setMsg("✅ Tour angelegt");
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Tour konnte nicht angelegt werden");
    }
  }

  async function ladeTour() {
    if (!selectedFahrer || !datum) {
      alert("Bitte Fahrer und Datum auswählen!");
      return;
    }
    try {
      const data = await api.getTour(selectedFahrer, datum);
      setTour(data.tour);
      setStopps(data.stopps || []);
      setMsg(data.tour ? "✅ Tour geladen" : "ℹ️ Keine Tour vorhanden");
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Tour konnte nicht geladen werden");
    }
  }

  // ---- STOPPS (nur hinzufügen; bestehende Stopps sind read-only) ----
  async function addStopp() {
    if (!tour?.id) {
      alert("Bitte zuerst eine Tour anlegen oder laden!");
      return;
    }

    // Pflichtfelder prüfen
    const payload = { ...neuStopp };
    if (!payload.kunde || !payload.adresse) {
      alert("Bitte mindestens Kunde und Adresse eingeben!");
      return;
    }

    // position optional -> Zahl oder null
    if (payload.position === "") {
      payload.position = null;
    } else {
      const p = Number(payload.position);
      payload.position = Number.isFinite(p) ? p : null;
    }

    try {
      const s = await api.createStopp(tour.id, payload);
      setStopps([...stopps, s]);
      setNeuStopp({
        kunde: "",
        adresse: "",
        telefon: "",
        kommission: "",
        hinweis: "",
        position: "",
        ankunft: "",
      });
      setMsg("✅ Stopp hinzugefügt");
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Stopp konnte nicht angelegt werden");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tourenplanung</h1>

      {/* Fahrer-Auswahl */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Fahrer</h2>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}

        <div className="flex flex-wrap gap-2">
          <select
            className="border rounded-md px-3 py-2"
            value={selectedFahrer}
            onChange={(e) => setSelectedFahrer(e.target.value)}
          >
            <option value="">– Fahrer auswählen –</option>
            {fahrer.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <button
            onClick={addFahrer}
            className="bg-[#0058A3] text-white px-3 py-2 rounded-md hover:bg-blue-800"
          >
            + Fahrer
          </button>
        </div>

        <div className="mt-3">
          {fahrer.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center bg-gray-100 px-2 py-1 rounded mr-2 mb-2"
            >
              {f.name}
              <button
                onClick={() => deleteFahrer(f.id)}
                className="ml-2 text-red-600 hover:text-red-800"
                title="Fahrer löschen"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Tour */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Tour</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-gray-600 block">Datum</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          <button
            onClick={anlegenTour}
            className="bg-[#0058A3] text-white px-4 py-2 rounded-md hover:bg-blue-800"
          >
            Tour anlegen
          </button>
          <button
            onClick={ladeTour}
            className="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            Tour laden
          </button>
        </div>

        {tour && (
          <div className="mt-4 text-sm text-gray-700">
            <div>
              <b>Tour-ID:</b> {tour.id}
            </div>
            <div>
              <b>Fahrer-ID:</b> {tour.fahrer_id}
            </div>
            <div>
              <b>Datum:</b> {tour.datum}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Änderungen an Tourdaten oder Stopps bitte in <b>Tourverwaltung</b> vornehmen.
            </div>
          </div>
        )}
      </section>

      {/* Stopps (read-only Anzeige – nur Hinzufügen erlaubt) */}
      {tour && (
        <section className="bg-white p-4 rounded-lg shadow space-y-4">
          <h2 className="text-lg font-medium text-[#0058A3]">Stopps der Tour</h2>

          {/* Tabelle */}
          <table className="min-w-full border text-sm">
            <thead className="bg-[#0058A3] text-white">
              <tr>
                <th className="border px-2 py-1">Pos</th>
                <th className="border px-2 py-1">Kunde</th>
                <th className="border px-2 py-1">Adresse</th>
                <th className="border px-2 py-1">Telefon</th>
                <th className="border px-2 py-1">Kommission</th>
                <th className="border px-2 py-1">Hinweis</th>
                <th className="border px-2 py-1">Ankunft</th>
                {/* Keine Aktionen-Spalte mehr in Planung */}
              </tr>
            </thead>
            <tbody>
              {stopps.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-2 text-gray-500 italic">
                    Keine Stopps vorhanden
                  </td>
                </tr>
              )}
              {stopps.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-center">{s.position ?? ""}</td>
                  <td className="border px-2 py-1">{s.kunde}</td>
                  <td className="border px-2 py-1">{s.adresse}</td>
                  <td className="border px-2 py-1">{s.telefon || ""}</td>
                  <td className="border px-2 py-1">{s.kommission || ""}</td>
                  <td className="border px-2 py-1">{s.hinweis || ""}</td>
                  <td className="border px-2 py-1">{s.ankunft || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Formular Neuer Stopp (hier darf man hinzufügen) */}
          <div className="border-t pt-4">
            <h3 className="text-md font-semibold mb-2 text-[#0058A3]">
              + Neuen Stopp hinzufügen
            </h3>

            <div className="grid md:grid-cols-3 gap-3">
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Kunde"
                value={neuStopp.kunde}
                onChange={(e) => setNeuStopp({ ...neuStopp, kunde: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Adresse"
                value={neuStopp.adresse}
                onChange={(e) => setNeuStopp({ ...neuStopp, adresse: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Telefon"
                value={neuStopp.telefon}
                onChange={(e) => setNeuStopp({ ...neuStopp, telefon: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Kommission"
                value={neuStopp.kommission}
                onChange={(e) => setNeuStopp({ ...neuStopp, kommission: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Hinweis"
                value={neuStopp.hinweis}
                onChange={(e) => setNeuStopp({ ...neuStopp, hinweis: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2"
                placeholder="Position (z. B. 1, 2, 3)"
                value={neuStopp.position}
                onChange={(e) => setNeuStopp({ ...neuStopp, position: e.target.value })}
              />
              <input
                className="border rounded-md px-3 py-2 md:col-span-3"
                placeholder='Ankunft (z. B. "10:00", "ca. 11:30–12:00")'
                value={neuStopp.ankunft}
                onChange={(e) => setNeuStopp({ ...neuStopp, ankunft: e.target.value })}
              />
            </div>

            <button
              onClick={addStopp}
              className="mt-3 bg-[#0058A3] text-white px-4 py-2 rounded-md hover:bg-blue-800"
            >
              + Stopp hinzufügen
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
