import React, { useEffect, useState } from "react";
import { api } from "../api";

// Datum hübsch formatiert
function fmt(d) {
  try {
    return new Date(d).toLocaleDateString("de-DE");
  } catch {
    return d;
  }
}

// sichere Sortierung (Datum ↑, Position ↑, leere Positionen zuletzt)
function sortRowsAsc(a, b) {
  const dA = a.datum ?? "";
  const dB = b.datum ?? "";
  if (dA < dB) return -1;
  if (dA > dB) return 1;

  const posA = a.position;
  const posB = b.position;

  const aHas = Number.isFinite(posA);
  const bHas = Number.isFinite(posB);
  if (aHas && bHas) return posA - posB;
  if (aHas && !bHas) return -1; // echte Zahlen vor null/undefined
  if (!aHas && bHas) return 1;
  return 0;
}

export default function Uebersicht() {
  const [subTab, setSubTab] = useState("gesamt"); // "gesamt" | "woche"

  // Filter
  const [fahrer, setFahrer] = useState([]);
  const [filterFahrer, setFilterFahrer] = useState("");  // "" = Alle Fahrer
  const [filterVon, setFilterVon] = useState("");        // YYYY-MM-DD
  const [filterBis, setFilterBis] = useState("");        // YYYY-MM-DD
  const [filterKw, setFilterKw] = useState("");          // YYYY-Www
  const [filterKunde, setFilterKunde] = useState("");

  // Daten
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    ladeFahrer();
    applyFilter(); // initial & beim Tab-Wechsel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  async function ladeFahrer() {
    try {
      const data = await api.listFahrer();
      setFahrer(data);
    } catch (err) {
      console.error("Fahrer laden fehlgeschlagen:", err);
    }
  }

  async function applyFilter() {
    try {
      setLoading(true);
      setMsg("");

      // Filter für /touren-admin vorbereiten
      const payload =
        subTab === "woche"
          ? {
              fahrer_id: filterFahrer || undefined,
              kw: filterKw || undefined,          // YYYY-Www
              kunde: filterKunde || undefined,
            }
          : {
              fahrer_id: filterFahrer || undefined,
              date_from: filterVon || undefined,  // YYYY-MM-DD
              date_to: filterBis || undefined,    // YYYY-MM-DD
              kw: filterKw || undefined,          // optional zusätzlich
              kunde: filterKunde || undefined,
            };

      // 1) Touren holen
      const touren = await api.getTourenAdmin(payload);

      if (!Array.isArray(touren) || touren.length === 0) {
        setRows([]);
        setMsg("Keine Stopps gefunden.");
        return;
      }

      // 2) Für jede Tour Stopps laden und auf Zeilen mappen (jede Zeile = ein Stopp)
      const alleStoppsListen = await Promise.all(
        touren.map(async (t) => {
          try {
            const stopps = await api.getStoppsByTour(t.id);
            return (stopps || []).map((s) => ({
              stopp_id: s.id,
              datum: t.datum,                    // aus Tour
              fahrer_name: t.fahrer_name,        // aus Tour
              position: s.position ?? null,
              kunde: s.kunde || "",
              adresse: s.adresse || "",
              telefon: s.telefon || "",
              kommission: s.kommission || "",
              hinweis: s.hinweis || "",
              anmerkung_fahrer: s.anmerkung_fahrer || "",
              tour_bemerkung: t.bemerkung || "",
            }));
          } catch (e) {
            console.error(`Stopps für Tour ${t.id} laden fehlgeschlagen:`, e);
            // Wenn eine Tour fehlschlägt, liefern wir einfach keine Stopps für diese Tour,
            // die anderen Touren sollen trotzdem angezeigt werden.
            return [];
          }
        })
      );

      // 3) Flatten + Sort
      const flatRows = alleStoppsListen.flat().sort(sortRowsAsc);

      setRows(flatRows);
      if (flatRows.length === 0) setMsg("Keine Stopps gefunden.");
    } catch (err) {
      console.error("Stopps-Übersicht laden fehlgeschlagen:", err);
      setMsg("❌ Fehler beim Laden der Stopps-Übersicht");
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
    setRows([]);
    setMsg("");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Gesamtübersicht</h1>

      {/* Unter-Tabs */}
      <div className="bg-white p-2 rounded-lg shadow flex gap-2">
        <button
          className={`px-4 py-2 rounded-md ${
            subTab === "gesamt" ? "bg-[#0058A3] text-white" : "bg-gray-100"
          }`}
          onClick={() => setSubTab("gesamt")}
        >
          Gesamtübersicht
        </button>
        <button
          className={`px-4 py-2 rounded-md ${
            subTab === "woche" ? "bg-[#0058A3] text-white" : "bg-gray-100"
          }`}
          onClick={() => setSubTab("woche")}
        >
          Wochenübersicht
        </button>
      </div>

      {/* Filter */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Filter</h2>

        <div className="grid lg:grid-cols-5 md:grid-cols-3 grid-cols-1 gap-3">
          {/* Fahrer */}
          <div>
            <label className="text-sm text-gray-600 block">Fahrer</label>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={filterFahrer}
              onChange={(e) => setFilterFahrer(e.target.value)}
            >
              <option value="">Alle Fahrer</option>
              {fahrer.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Datum Von */}
          <div>
            <label className="text-sm text-gray-600 block">Datum von</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2 w-full"
              value={filterVon}
              onChange={(e) => setFilterVon(e.target.value)}
              disabled={subTab === "woche"}
            />
          </div>

          {/* Datum Bis */}
          <div>
            <label className="text-sm text-gray-600 block">Datum bis</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2 w-full"
              value={filterBis}
              onChange={(e) => setFilterBis(e.target.value)}
              disabled={subTab === "woche"}
            />
          </div>

          {/* Kalenderwoche */}
          <div>
            <label className="text-sm text-gray-600 block">Kalenderwoche</label>
            <input
              type="week"
              className="border rounded-md px-3 py-2 w-full"
              value={filterKw}
              onChange={(e) => setFilterKw(e.target.value)}
            />
          </div>

          {/* Kunde */}
          <div>
            <label className="text-sm text-gray-600 block">Kunde</label>
            <input
              type="text"
              className="border rounded-md px-3 py-2 w-full"
              placeholder="Kundenname suchen…"
              value={filterKunde}
              onChange={(e) => setFilterKunde(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={applyFilter}
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

      {/* Tabelle */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Stopps</h2>

        {loading && <div className="text-gray-500">Laden…</div>}
        {!loading && msg && <div className="text-gray-600">{msg}</div>}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="border px-2 py-1 text-left">Datum</th>
                  <th className="border px-2 py-1 text-left">Fahrer</th>
                  <th className="border px-2 py-1 text-left">Pos</th>
                  <th className="border px-2 py-1 text-left">Kunde</th>
                  <th className="border px-2 py-1 text-left">Adresse</th>
                  <th className="border px-2 py-1 text-left">Telefon</th>
                  <th className="border px-2 py-1 text-left">Kommission</th>
                  <th className="border px-2 py-1 text-left">Hinweis</th>
                  <th className="border px-2 py-1 text-left">Anmerkung Fahrer</th>
                  <th className="border px-2 py-1 text-left">Bemerkung Tour</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.stopp_id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1">{fmt(r.datum)}</td>
                    <td className="border px-2 py-1">{r.fahrer_name}</td>
                    <td className="border px-2 py-1">{r.position ?? ""}</td>
                    <td className="border px-2 py-1">{r.kunde}</td>
                    <td className="border px-2 py-1">{r.adresse}</td>
                    <td className="border px-2 py-1">
                      {r.telefon ? (
                        <a className="text-blue-600 hover:underline" href={`tel:${r.telefon.replace(/\s+/g, "")}`}>
                          {r.telefon}
                        </a>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {r.kommission || <span className="text-gray-400">–</span>}
                    </td>
                    <td className="border px-2 py-1">
                      {r.hinweis || <span className="text-gray-400">–</span>}
                    </td>
                    <td className="border px-2 py-1">
                      {r.anmerkung_fahrer || <span className="text-gray-400">–</span>}
                    </td>
                    <td className="border px-2 py-1">
                      {r.tour_bemerkung || <span className="text-gray-400">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
