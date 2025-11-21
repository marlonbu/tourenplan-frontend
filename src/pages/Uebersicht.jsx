// src/pages/Uebersicht.jsx
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
  // Filter
  const [fahrer, setFahrer] = useState([]);
  const [filterFahrer, setFilterFahrer] = useState("");  // "" = Alle Fahrer
  const [filterVon, setFilterVon] = useState("");        // YYYY-MM-DD
  const [filterBis, setFilterBis] = useState("");        // YYYY-MM-DD
  const [filterKw, setFilterKw] = useState("");          // YYYY-Www (optional)
  const [filterKunde, setFilterKunde] = useState("");

  // Daten
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Optional: clientseitige Status-Tabs (Alle / Bevorstehend / Vergangen)
  const [statusTab, setStatusTab] = useState("alle"); // "alle" | "future" | "past"

  useEffect(() => {
    ladeFahrer();
    applyFilter(); // initialer Load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Für /touren-admin:
      // Wenn Von/Bis gesetzt ist, verwenden wir diese (KW wird vom Backend dann ignoriert).
      // Wenn Von/Bis leer sind und KW gesetzt ist, verwenden wir KW.
      const useDates = !!(filterVon || filterBis);
      const payload = {
        fahrer_id: filterFahrer || undefined,
        date_from: useDates ? filterVon || undefined : undefined,
        date_to: useDates ? filterBis || undefined : undefined,
        kw: !useDates ? (filterKw || undefined) : undefined,
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
            // Wenn eine Tour fehlschlägt, zeigen wir die anderen Touren trotzdem an.
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
    setStatusTab("alle");
  }

  // Clientseitige Status-Filterung für die Ansicht (ohne API-Änderung)
  const filteredRowsForView = (() => {
    if (statusTab === "alle") return rows;
    const today = new Date().toISOString().slice(0, 10);
    if (statusTab === "future") return rows.filter((r) => (r.datum ?? "") >= today);
    return rows.filter((r) => (r.datum ?? "") < today); // "past"
  })();

  // Hilfen
  const telHref = (raw) =>
    raw ? `tel:${String(raw).replace(/[()\s\-\/]/g, "")}` : "";

  const gmapsSearch = (addr) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || "")}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Gesamtübersicht</h1>

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
            />
          </div>

          {/* Kalenderwoche (optional) */}
          <div>
            <label className="text-sm text-gray-600 block">Kalenderwoche</label>
            <input
              type="week"
              className="border rounded-md px-3 py-2 w-full"
              value={filterKw}
              onChange={(e) => setFilterKw(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Hinweis: Wenn „Datum von/bis“ gesetzt ist, wird die KW ignoriert.
            </p>
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

        {/* Status-Tabs (clientseitig) */}
        <div className="pt-3">
          <div className="inline-flex rounded-lg overflow-hidden border">
            {[
              { id: "alle", label: "Alle" },
              { id: "future", label: "Bevorstehend" },
              { id: "past", label: "Vergangen" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setStatusTab(t.id)}
                className={
                  "px-3 py-2 text-sm " +
                  (statusTab === t.id
                    ? "bg-[#0058A3] text-white"
                    : "bg-white hover:bg-gray-50")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILE: Card-Ansicht (unter md) */}
      <section className="md:hidden">
        {loading && (
          <div className="bg-white rounded-lg shadow p-4 text-gray-500">
            Laden…
          </div>
        )}

        {!loading && msg && (
          <div className="bg-white rounded-lg shadow p-4 text-gray-600">
            {msg}
          </div>
        )}

        {!loading && filteredRowsForView.length > 0 && (
          <div className="space-y-3">
            {filteredRowsForView.map((r) => (
              <div
                key={r.stopp_id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500">{fmt(r.datum)}</div>
                    <div className="text-sm text-gray-600">{r.fahrer_name}</div>
                    <div className="mt-1 font-semibold text-gray-900">
                      {r.position != null ? `Pos ${r.position} · ` : ""}
                      {r.kunde}
                    </div>
                  </div>
                  {/* kleine Badges optional */}
                </div>

                <div className="mt-3 space-y-1.5 text-[15px]">
                  <div>
                    <a
                      href={gmapsSearch(r.adresse)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-words"
                      title="In Google Maps öffnen"
                    >
                      {r.adresse}
                    </a>
                  </div>

                  <div className="text-gray-700">
                    <span className="font-medium">Kommission:</span>{" "}
                    {r.kommission || <span className="text-gray-400">–</span>}
                  </div>

                  <div className="text-gray-700">
                    <span className="font-medium">Hinweis:</span>{" "}
                    {r.hinweis || <span className="text-gray-400">–</span>}
                  </div>

                  <div className="text-gray-700">
                    <span className="font-medium">Anmerkung Fahrer:</span>{" "}
                    {r.anmerkung_fahrer || (
                      <span className="text-gray-400">–</span>
                    )}
                  </div>

                  <div className="text-gray-700">
                    <span className="font-medium">Bemerkung Tour:</span>{" "}
                    {r.tour_bemerkung || (
                      <span className="text-gray-400">–</span>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-4 flex items-center gap-2">
                  {r.telefon ? (
                    <a
                      href={telHref(r.telefon)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-gray-50"
                    >
                      📞 <span className="text-sm">{r.telefon}</span>
                    </a>
                  ) : null}

                  <a
                    href={gmapsSearch(r.adresse)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-gray-50"
                  >
                    🗺️ <span className="text-sm">Route</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* DESKTOP: Tabelle (ab md) */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3 hidden md:block">
        <h2 className="text-lg font-medium text-[#0058A3]">Stopps</h2>

        {loading && <div className="text-gray-500">Laden…</div>}
        {!loading && msg && <div className="text-gray-600">{msg}</div>}

        {!loading && filteredRowsForView.length > 0 && (
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
                {filteredRowsForView.map((r) => (
                  <tr key={r.stopp_id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1">{fmt(r.datum)}</td>
                    <td className="border px-2 py-1">{r.fahrer_name}</td>
                    <td className="border px-2 py-1">{r.position ?? ""}</td>
                    <td className="border px-2 py-1">{r.kunde}</td>
                    <td className="border px-2 py-1">
                      <a
                        className="text-blue-600 hover:underline"
                        href={gmapsSearch(r.adresse)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.adresse}
                      </a>
                    </td>
                    <td className="border px-2 py-1">
                      {r.telefon ? (
                        <a
                          className="text-blue-600 hover:underline"
                          href={telHref(r.telefon)}
                        >
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
