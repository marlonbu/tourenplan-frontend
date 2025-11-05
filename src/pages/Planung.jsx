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
    ankunft: "",
  });

  const [msg, setMsg] = useState("");

  // Modal: Fahrer verwalten
  const [showManage, setShowManage] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [manageBusy, setManageBusy] = useState(false);

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

  // ---- Tour ----
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

  // ---- Fahrer verwalten (Modal) ----
  function openManage() {
    setNewDriverName("");
    setShowManage(true);
  }
  function closeManage() {
    if (manageBusy) return; // während Vorgang schließen verhindern
    setShowManage(false);
  }

  async function modalAddFahrer() {
    const name = newDriverName.trim();
    if (!name) return;
    try {
      setManageBusy(true);
      await api.addFahrer(name);
      setNewDriverName("");
      await ladeFahrer();
    } catch (err) {
      console.error("Fahrer hinzufügen fehlgeschlagen:", err);
      alert("❌ Fahrer konnte nicht hinzugefügt werden");
    } finally {
      setManageBusy(false);
    }
  }

  async function modalDeleteFahrer(id, name) {
    const ok = window.confirm(`Fahrer „${name}“ wirklich löschen?`);
    if (!ok) return;
    try {
      setManageBusy(true);
      await api.deleteFahrer(id);
      // Ausgewählten Fahrer zurücksetzen, falls gerade gelöscht
      setSelectedFahrer((cur) => (String(cur) === String(id) ? "" : cur));
      await ladeFahrer();
    } catch (err) {
      console.error("Fahrer löschen fehlgeschlagen:", err);
      alert("❌ Fahrer konnte nicht gelöscht werden");
    } finally {
      setManageBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tourenplanung</h1>

      {/* Fahrer-Auswahl */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Fahrer</h2>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}

        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-sm text-gray-600 block">Fahrer auswählen</label>
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
          </div>

          <button
            onClick={openManage}
            className="bg-[#0058A3] text-white px-3 py-2 rounded-md hover:bg-blue-800"
          >
            Fahrer verwalten
          </button>
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

          {/* Formular Neuer Stopp */}
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

      {/* Modal: Fahrer verwalten */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black opacity-40"
            onClick={closeManage}
            aria-hidden="true"
          />
          {/* Dialog */}
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-5 z-10">
            <h3 className="text-lg font-semibold text-[#0058A3] mb-3">Fahrer verwalten</h3>

            {/* Hinzufügen */}
            <div className="flex gap-2 mb-4">
              <input
                className="border rounded-md px-3 py-2 w-full"
                placeholder="Neuen Fahrername eingeben…"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") modalAddFahrer();
                }}
                disabled={manageBusy}
              />
              <button
                onClick={modalAddFahrer}
                className="bg-[#0058A3] text-white px-3 py-2 rounded-md hover:bg-blue-800 disabled:opacity-60"
                disabled={manageBusy || !newDriverName.trim()}
              >
                Hinzufügen
              </button>
            </div>

            {/* Liste */}
            <div className="max-h-64 overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2 w-28">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {fahrer.length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-gray-500 italic" colSpan={2}>
                        Keine Fahrer vorhanden
                      </td>
                    </tr>
                  )}
                  {fahrer.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-3 py-2">{f.name}</td>
                      <td className="px-3 py-2">
                        <button
                          className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                          onClick={() => modalDeleteFahrer(f.id, f.name)}
                          disabled={manageBusy}
                          title="Fahrer löschen"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-right">
              <button
                onClick={closeManage}
                className="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300 disabled:opacity-60"
                disabled={manageBusy}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
