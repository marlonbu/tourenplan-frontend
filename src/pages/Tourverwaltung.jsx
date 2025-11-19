import React, { useEffect, useState } from "react";
import { api } from "../api";

// Datum hübsch
function fmt(d) {
  try {
    return new Date(d).toLocaleDateString("de-DE");
  } catch {
    return d;
  }
}

export default function Tourverwaltung() {
  // Filter
  const [fahrer, setFahrer] = useState([]);
  const [filterFahrer, setFilterFahrer] = useState(""); // "" = Alle
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");
  const [filterKw, setFilterKw] = useState("");
  const [filterKunde, setFilterKunde] = useState("");

  // Daten
  const [touren, setTouren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Stopps einer Tour (auf-/zuklappen): tour_id -> Stopps[]
  const [stoppsMap, setStoppsMap] = useState({}); // { [tourId]: Stopp[] }

  // Tour-Edit: tour_id -> { fahrer_id, datum, bemerkung }
  const [editTour, setEditTour] = useState({});

  // Stopp-Edit: stopp_id -> bool (edit an/aus)
  const [stoppEditing, setStoppEditing] = useState({}); // { [stoppId]: true|false }

  // Stopp-Formdaten im Edit: stopp_id -> {felder}
  const [stoppDraft, setStoppDraft] = useState({}); // { [stoppId]: { ... } }

  // ---- Neu: Verschieben-Modal ----
  const [moveModal, setMoveModal] = useState({
    open: false,
    srcTourId: null,
    stoppId: null,
    // Ziel
    targetFahrerId: "",
    targetDatum: "",
    busy: false,
    error: "",
  });

  useEffect(() => {
    ladeFahrer();
    ladeTouren(); // initial
  }, []);

  async function ladeFahrer() {
    try {
      const data = await api.listFahrer();
      setFahrer(data);
    } catch (e) {
      console.error("Fahrer laden fehlgeschlagen:", e);
    }
  }

  async function ladeTouren() {
    try {
      setLoading(true);
      setMsg("");
      const payload = {
        fahrer_id: filterFahrer || undefined,
        date_from: filterVon || undefined,
        date_to: filterBis || undefined,
        kw: filterKw || undefined,
        kunde: filterKunde || undefined,
      };
      const data = await api.getTourenAdmin(payload);
      setTouren(data);
      if (data.length === 0) setMsg("Keine Touren gefunden.");
    } catch (err) {
      setMsg("❌ Fehler beim Laden der Touren");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function resetFilter() {
    setFilterFahrer("");
    setFilterVon("");
    setFilterBis("");
    setFilterKw("");
    setFilterKunde("");
    setTouren([]);
    setStoppsMap({});
    setMsg("");
  }

  async function toggleStopps(tourId) {
    if (stoppsMap[tourId]) {
      // einklappen
      setStoppsMap((m) => {
        const copy = { ...m };
        delete copy[tourId];
        return copy;
      });
      // Edit-States der betroffenen Stopps entfernen
      const toClear = new Set((stoppsMap[tourId] || []).map((s) => s.id));
      setStoppEditing((e) => {
        const c = { ...e };
        for (const id of toClear) delete c[id];
        return c;
      });
      setStoppDraft((d) => {
        const c = { ...d };
        for (const id of toClear) delete c[id];
        return c;
      });
      return;
    }
    // laden und ausklappen
    try {
      const s = await api.getStoppsByTour(tourId);
      setStoppsMap((m) => ({ ...m, [tourId]: s }));
      // Drafts initialisieren (ohne in den Editmodus zu gehen)
      setStoppDraft((prev) => {
        const next = { ...prev };
        for (const item of s) {
          next[item.id] = {
            position: item.position ?? "",
            ankunft: item.ankunft ?? "",
            kunde: item.kunde ?? "",
            adresse: item.adresse ?? "",
            telefon: item.telefon ?? "",
            kommission: item.kommission ?? "",
            hinweis: item.hinweis ?? "",
          };
        }
        return next;
      });
    } catch (e) {
      console.error(e);
      alert("Stopps konnten nicht geladen werden.");
    }
  }

  // ---- Tour bearbeiten (inline)
  function startEditTour(t) {
    setEditTour((st) => ({
      ...st,
      [t.id]: { fahrer_id: t.fahrer_id, datum: t.datum, bemerkung: t.bemerkung ?? "" },
    }));
  }
  function cancelEditTour(tid) {
    setEditTour((st) => {
      const c = { ...st };
      delete c[tid];
      return c;
    });
  }
  async function saveEditTour(tid) {
    try {
      const payload = editTour[tid];
      await api.updateTour(tid, payload);
      // Liste neu laden
      await ladeTouren();
      cancelEditTour(tid);
    } catch (e) {
      console.error(e);
      alert("Tour konnte nicht gespeichert werden.");
    }
  }
  async function deleteTour(tid, stopps_count) {
    const ok = confirm(
      stopps_count && Number(stopps_count) > 0
        ? `Diese Tour hat ${stopps_count} Stopps. Wirklich löschen?`
        : "Tour wirklich löschen?"
    );
    if (!ok) return;
    try {
      await api.deleteTour(tid);
      // aus State entfernen
      setTouren((list) => list.filter((t) => t.id !== tid));
      setStoppsMap((m) => {
        const c = { ...m };
        delete c[tid];
        return c;
      });
    } catch (e) {
      console.error(e);
      alert("Tour konnte nicht gelöscht werden.");
    }
  }

  // ---- Stopp Editmodus
  function enterStoppEdit(stopp) {
    setStoppEditing((e) => ({ ...e, [stopp.id]: true }));
    setStoppDraft((d) => ({
      ...d,
      [stopp.id]: {
        position: stopp.position ?? "",
        ankunft: stopp.ankunft ?? "",
        kunde: stopp.kunde ?? "",
        adresse: stopp.adresse ?? "",
        telefon: stopp.telefon ?? "",
        kommission: stopp.kommission ?? "",
        hinweis: stopp.hinweis ?? "",
      },
    }));
  }

  function cancelStoppEdit(stoppId) {
    setStoppEditing((e) => {
      const c = { ...e };
      delete c[stoppId];
      return c;
    });
    // Draft behalten ist okay
  }

  function changeStoppDraft(stoppId, field, value) {
    setStoppDraft((d) => ({ ...d, [stoppId]: { ...d[stoppId], [field]: value } }));
  }

  async function saveStopp(stoppId, tourId) {
    try {
      const payload = stoppDraft[stoppId] || {};
      // Typkonvertierung für position
      if (payload.position === "") payload.position = null;
      if (payload.position != null) payload.position = Number(payload.position);
      // ankunft bleibt String (frei formatiert, z. B. "10:00", "ca. 11–12 Uhr")

      await api.updateStopp(stoppId, payload);

      // Tabelle aktualisieren
      setStoppsMap((m) => ({
        ...m,
        [tourId]: (m[tourId] || []).map((s) =>
          s.id === stoppId ? { ...s, ...payload } : s
        ),
      }));

      // Editmodus schließen
      cancelStoppEdit(stoppId);
    } catch (e) {
      console.error(e);
      alert("Stopp konnte nicht gespeichert werden.");
    }
  }

  async function deleteStopp(stoppId, tourId) {
    const ok = confirm("Diesen Stopp wirklich löschen?");
    if (!ok) return;
    try {
      await api.deleteStopp(stoppId);
      setStoppsMap((m) => ({
        ...m,
        [tourId]: (m[tourId] || []).filter((s) => s.id !== stoppId),
      }));
      // Editstate/Draft bereinigen
      setStoppEditing((e) => {
        const c = { ...e };
        delete c[stoppId];
        return c;
      });
      setStoppDraft((d) => {
        const c = { ...d };
        delete c[stoppId];
        return c;
      });
    } catch (e) {
      console.error(e);
      alert("Stopp konnte nicht gelöscht werden.");
    }
  }

  // --------- Neu: Verschieben-Flow ----------
  function openMoveModal(stopp, srcTourId, defaultFahrerId, defaultDatum) {
    setMoveModal({
      open: true,
      srcTourId,
      stoppId: stopp.id,
      targetFahrerId: defaultFahrerId ?? "",
      targetDatum: defaultDatum ?? "",
      busy: false,
      error: "",
    });
  }

  function closeMoveModal() {
    setMoveModal((s) => ({ ...s, open: false }));
  }

  async function ensureTour(fahrerId, datum) {
    // Wenn es die Tour gibt -> nutzen, sonst anlegen
    const res = await api.getTour(fahrerId, datum);
    if (res?.tour?.id) return res.tour.id;
    const t = await api.createTour(fahrerId, datum);
    return t.id;
  }

  function findStoppInState(tourId, stoppId) {
    const list = stoppsMap[tourId] || [];
    return list.find((x) => x.id === stoppId);
  }

  async function performMove() {
    const { srcTourId, stoppId, targetFahrerId, targetDatum } = moveModal;
    if (!srcTourId || !stoppId || !targetFahrerId || !targetDatum) {
      setMoveModal((s) => ({ ...s, error: "Bitte Fahrer und Datum wählen." }));
      return;
    }

    try {
      setMoveModal((s) => ({ ...s, busy: true, error: "" }));

      // 1) Ziel-Tour sicherstellen
      const targetTourId = await ensureTour(Number(targetFahrerId), targetDatum);

      // 2) Ausgangs-Stopp-Objekt besorgen (aktueller Stand)
      const srcStopp = findStoppInState(srcTourId, stoppId);
      if (!srcStopp) throw new Error("Quell-Stopp nicht gefunden.");

      // 3) Payload zum Klonen zusammenbauen
      const payload = {
        // alle Felder, die createStopp akzeptiert (wie in Planung.jsx genutzt)
        kunde: srcStopp.kunde || "",
        adresse: srcStopp.adresse || "",
        telefon: srcStopp.telefon || "",
        kommission: srcStopp.kommission || "",
        hinweis: srcStopp.hinweis || "",
        position: Number.isFinite(srcStopp.position) ? srcStopp.position : null,
        ankunft: srcStopp.ankunft || "",
      };

      // 4) Neuen Stopp in Ziel-Tour anlegen
      const newStopp = await api.createStopp(targetTourId, payload);

      // 5) Alten Stopp löschen
      await api.deleteStopp(stoppId);

      // 6) UI aktualisieren
      setStoppsMap((m) => {
        const copy = { ...m };
        // Aus Quelltour entfernen
        copy[srcTourId] = (copy[srcTourId] || []).filter((s) => s.id !== stoppId);
        // Wenn Zieltour geöffnet ist, dort hinzufügen
        if (copy[targetTourId]) {
          copy[targetTourId] = [...copy[targetTourId], newStopp];
        }
        return copy;
      });

      closeMoveModal();
      alert("Stopp wurde verschoben. Hinweis: vorhandene Fotos bleiben beim alten Stopp.");
    } catch (e) {
      console.error(e);
      setMoveModal((s) => ({
        ...s,
        error: e?.message || "Verschieben fehlgeschlagen.",
        busy: false,
      }));
      return;
    } finally {
      setMoveModal((s) => ({ ...s, busy: false }));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tourverwaltung</h1>

      {/* Filter */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Filter</h2>
        <div className="grid lg:grid-cols-5 md:grid-cols-3 grid-cols-1 gap-3">
          <div>
            <label className="text-sm text-gray-600 block">Fahrer</label>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={filterFahrer}
              onChange={(e) => setFilterFahrer(e.target.value)}
            >
              <option value="">Alle Fahrer</option>
              {fahrer.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600 block">Datum von</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2 w-full"
              value={filterVon}
              onChange={(e) => setFilterVon(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block">Datum bis</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2 w-full"
              value={filterBis}
              onChange={(e) => setFilterBis(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block">Kalenderwoche</label>
            <input
              type="week"
              className="border rounded-md px-3 py-2 w-full"
              value={filterKw}
              onChange={(e) => setFilterKw(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block">Kunde</label>
            <input
              type="text"
              className="border rounded-md px-3 py-2 w-full"
              placeholder="Kundenname…"
              value={filterKunde}
              onChange={(e) => setFilterKunde(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={ladeTouren}
            className="bg-[#0058A3] text-white px-4 py-2 rounded-md hover:bg-blue-800"
          >
            Filter anwenden
          </button>
          <button
            onClick={resetFilter}
            className="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            Zurücksetzen
          </button>
        </div>
      </section>

      {/* Tabelle Touren */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Touren</h2>

        {loading && <div className="text-gray-500">Laden…</div>}
        {!loading && msg && <div className="text-gray-600">{msg}</div>}

        {!loading && touren.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="border px-2 py-1 text-left">Datum</th>
                  <th className="border px-2 py-1 text-left">Fahrer</th>
                  <th className="border px-2 py-1 text-left">Stopps</th>
                  <th className="border px-2 py-1 text-left">Kunden (Auszug)</th>
                  <th className="border px-2 py-1 text-left">Bemerkung</th>
                  <th className="border px-2 py-1 text-left">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {touren.map((t) => {
                  const isEdit = !!editTour[t.id];
                  return (
                    <React.Fragment key={t.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="border px-2 py-1">
                          {isEdit ? (
                            <input
                              type="date"
                              className="border rounded px-2 py-1"
                              value={editTour[t.id].datum || ""}
                              onChange={(e) =>
                                setEditTour((st) => ({
                                  ...st,
                                  [t.id]: { ...st[t.id], datum: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            fmt(t.datum)
                          )}
                        </td>
                        <td className="border px-2 py-1">
                          {isEdit ? (
                            <select
                              className="border rounded px-2 py-1"
                              value={editTour[t.id].fahrer_id || ""}
                              onChange={(e) =>
                                setEditTour((st) => ({
                                  ...st,
                                  [t.id]: { ...st[t.id], fahrer_id: Number(e.target.value) },
                                }))
                              }
                            >
                              {fahrer.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          ) : (
                            t.fahrer_name
                          )}
                        </td>
                        <td className="border px-2 py-1">{t.stopps_count}</td>
                        <td className="border px-2 py-1">{t.kunden_preview || "–"}</td>
                        <td className="border px-2 py-1">
                          {isEdit ? (
                            <input
                              type="text"
                              className="border rounded px-2 py-1 w-64"
                              value={editTour[t.id].bemerkung || ""}
                              onChange={(e) =>
                                setEditTour((st) => ({
                                  ...st,
                                  [t.id]: { ...st[t.id], bemerkung: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            t.bemerkung || <span className="text-gray-400">–</span>
                          )}
                        </td>
                        <td className="border px-2 py-1">
                          {!isEdit ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                                onClick={() => toggleStopps(t.id)}
                              >
                                {stoppsMap[t.id] ? "Stopps ausblenden" : "Stopps anzeigen"}
                              </button>
                              <button
                                className="px-3 py-1 rounded bg-yellow-200 hover:bg-yellow-300"
                                onClick={() => startEditTour(t)}
                              >
                                ✏️ Bearbeiten
                              </button>
                              <button
                                className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                                onClick={() => deleteTour(t.id, t.stopps_count)}
                              >
                                🗑️ Tour löschen
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="px-3 py-1 rounded bg-[#0058A3] text-white hover:bg-blue-800"
                                onClick={() => saveEditTour(t.id)}
                              >
                                💾 Speichern
                              </button>
                              <button
                                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                                onClick={() => cancelEditTour(t.id)}
                              >
                                Abbrechen
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Untertabelle Stopps */}
                      {stoppsMap[t.id] && (
                        <tr>
                          <td className="border px-2 py-2 bg-gray-50" colSpan={6}>
                            <div className="overflow-x-auto">
                              <table className="min-w-full border text-sm">
                                <thead className="bg-gray-200">
                                  <tr>
                                    <th className="border px-2 py-1 text-left">Pos</th>
                                    <th className="border px-2 py-1 text-left">Ankunft</th>
                                    <th className="border px-2 py-1 text-left">Kunde</th>
                                    <th className="border px-2 py-1 text-left">Adresse</th>
                                    <th className="border px-2 py-1 text-left">Telefon</th>
                                    <th className="border px-2 py-1 text-left">Kommission</th>
                                    <th className="border px-2 py-1 text-left">Hinweis</th>
                                    <th className="border px-2 py-1 text-left">Aktionen</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stoppsMap[t.id].length === 0 && (
                                    <tr>
                                      <td colSpan={8} className="text-center py-2 text-gray-500">
                                        Keine Stopps
                                      </td>
                                    </tr>
                                  )}
                                  {stoppsMap[t.id].map((s) => {
                                    const isEditing = !!stoppEditing[s.id];
                                    const draft = stoppDraft[s.id] || {};
                                    return (
                                      <tr key={s.id} className="hover:bg-white">
                                        {/* Pos */}
                                        <td className="border px-2 py-1 w-16">
                                          {!isEditing ? (
                                            s.position ?? ""
                                          ) : (
                                            <input
                                              type="number"
                                              className="border rounded px-2 py-1 w-full text-center"
                                              value={
                                                draft.position === 0
                                                  ? 0
                                                  : draft.position ?? ""
                                              }
                                              onChange={(e) =>
                                                changeStoppDraft(
                                                  s.id,
                                                  "position",
                                                  e.target.value === "" ? "" : Number(e.target.value)
                                                )
                                              }
                                            />
                                          )}
                                        </td>

                                        {/* Ankunft */}
                                        <td className="border px-2 py-1 w-28">
                                          {!isEditing ? (
                                            s.ankunft || <span className="text-gray-400">–</span>
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              placeholder="z. B. 10:00 / 10–12"
                                              value={draft.ankunft ?? ""}
                                              onChange={(e) =>
                                                changeStoppDraft(s.id, "ankunft", e.target.value)
                                              }
                                            />
                                          )}
                                        </td>

                                        {/* Kunde */}
                                        <td className="border px-2 py-1 w-56">
                                          {!isEditing ? (
                                            s.kunde
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              value={draft.kunde ?? ""}
                                              onChange={(e) => changeStoppDraft(s.id, "kunde", e.target.value)}
                                            />
                                          )}
                                        </td>

                                        {/* Adresse */}
                                        <td className="border px-2 py-1 w-72">
                                          {!isEditing ? (
                                            s.adresse
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              value={draft.adresse ?? ""}
                                              onChange={(e) => changeStoppDraft(s.id, "adresse", e.target.value)}
                                            />
                                          )}
                                        </td>

                                        {/* Telefon */}
                                        <td className="border px-2 py-1 w-48">
                                          {!isEditing ? (
                                            s.telefon || <span className="text-gray-400">–</span>
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              value={draft.telefon ?? ""}
                                              onChange={(e) => changeStoppDraft(s.id, "telefon", e.target.value)}
                                            />
                                          )}
                                        </td>

                                        {/* Kommission */}
                                        <td className="border px-2 py-1 w-48">
                                          {!isEditing ? (
                                            s.kommission || <span className="text-gray-400">–</span>
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              value={draft.kommission ?? ""}
                                              onChange={(e) => changeStoppDraft(s.id, "kommission", e.target.value)}
                                            />
                                          )}
                                        </td>

                                        {/* Hinweis */}
                                        <td className="border px-2 py-1 w-72">
                                          {!isEditing ? (
                                            s.hinweis || <span className="text-gray-400">–</span>
                                          ) : (
                                            <input
                                              type="text"
                                              className="border rounded px-2 py-1 w-full"
                                              value={draft.hinweis ?? ""}
                                              onChange={(e) => changeStoppDraft(s.id, "hinweis", e.target.value)}
                                            />
                                          )}
                                        </td>

                                        {/* Aktionen */}
                                        <td className="border px-2 py-1">
                                          {!isEditing ? (
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                className="px-3 py-1 rounded bg-yellow-200 hover:bg-yellow-300"
                                                onClick={() => enterStoppEdit(s)}
                                              >
                                                ✏️ Bearbeiten
                                              </button>
                                              <button
                                                className="px-3 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600"
                                                onClick={() =>
                                                  openMoveModal(
                                                    s,
                                                    t.id,
                                                    t.fahrer_id,
                                                    t.datum
                                                  )
                                                }
                                              >
                                                🔁 Verschieben
                                              </button>
                                              <button
                                                className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                                                onClick={() => deleteStopp(s.id, t.id)}
                                              >
                                                🗑️ Löschen
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                className="px-3 py-1 rounded bg-[#0058A3] text-white hover:bg-blue-800"
                                                onClick={() => saveStopp(s.id, t.id)}
                                              >
                                                💾 Speichern
                                              </button>
                                              <button
                                                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                                                onClick={() => cancelStoppEdit(s.id)}
                                              >
                                                Abbrechen
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Neu: Verschieben Modal ---- */}
      {moveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black opacity-40"
            onClick={closeMoveModal}
            aria-hidden="true"
          />
          {/* Dialog */}
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-5 z-10">
            <h3 className="text-lg font-semibold text-[#0058A3] mb-3">
              Stopp verschieben
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600 block">Ziel-Fahrer</label>
                <select
                  className="border rounded-md px-3 py-2 w-full"
                  value={moveModal.targetFahrerId}
                  onChange={(e) =>
                    setMoveModal((s) => ({ ...s, targetFahrerId: e.target.value }))
                  }
                  disabled={moveModal.busy}
                >
                  <option value="">— bitte wählen —</option>
                  {fahrer.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 block">Ziel-Datum</label>
                <input
                  type="date"
                  className="border rounded-md px-3 py-2 w-full"
                  value={moveModal.targetDatum}
                  onChange={(e) =>
                    setMoveModal((s) => ({ ...s, targetDatum: e.target.value }))
                  }
                  disabled={moveModal.busy}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Hinweis: Fotos können nicht automatisch mitverschoben werden (bleiben beim
              alten Stopp). Die Stoppdaten (Kunde, Adresse, Ankunft, Position, …) werden
              vollständig übernommen.
            </p>

            {moveModal.error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {moveModal.error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-60"
                onClick={closeMoveModal}
                disabled={moveModal.busy}
              >
                Abbrechen
              </button>
              <button
                className="px-4 py-2 rounded bg-[#0058A3] text-white hover:bg-blue-800 disabled:opacity-60"
                onClick={performMove}
                disabled={moveModal.busy}
              >
                {moveModal.busy ? "Verschiebe…" : "Verschieben"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
