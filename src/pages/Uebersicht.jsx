// src/pages/Uebersicht.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function telHref(raw) {
  if (!raw) return "";
  const cleaned = String(raw).replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("de-DE");
  } catch {
    return d;
  }
}

export default function Uebersicht() {
  // Filter
  const [fahrer, setFahrer] = useState([]);
  const [filterFahrer, setFilterFahrer] = useState(""); // "" = alle
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");
  const [filterKw, setFilterKw] = useState("");
  const [filterKunde, setFilterKunde] = useState("");

  // Daten
  const [touren, setTouren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Mobile: Stopps-Accordion je Tour
  const [openStops, setOpenStops] = useState({}); // { [tourId]: true }

  // Tab-Ansicht: alle | zukünftig | vergangen
  const [tab, setTab] = useState("alle");

  useEffect(() => {
    ladeFahrer();
    ladeTouren();
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
      setTouren(data || []);
      if (!data || data.length === 0) setMsg("Keine Touren gefunden.");
    } catch (err) {
      console.error(err);
      setMsg("❌ Fehler beim Laden der Touren");
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
    setOpenStops({});
    setMsg("");
  }

  // Clientseitige Tab-Filterung
  const todayISO = new Date().toISOString().slice(0, 10);
  const gefiltert = useMemo(() => {
    if (!touren?.length) return [];
    if (tab === "alle") return touren;
    if (tab === "zukuenftig") {
      return touren.filter((t) => String(t.datum) > todayISO);
    }
    if (tab === "vergangen") {
      return touren.filter((t) => String(t.datum) < todayISO);
    }
    return touren;
  }, [touren, tab, todayISO]);

  // Stopps lazy laden: wir nutzen vorhandenen Admin-Endpoint je Tour
  async function toggleStopps(tour) {
    const id = tour.id;
    if (openStops[id]) {
      setOpenStops((m) => {
        const c = { ...m };
        delete c[id];
        return c;
      });
      return;
    }
    try {
      // Minimale Zusatzabfrage: Stopps anzeigen
      const s = await api.getStoppsByTour(id);
      setOpenStops((m) => ({ ...m, [id]: s || [] }));
    } catch (e) {
      console.error(e);
      alert("Stopps konnten nicht geladen werden.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#0058A3]">Gesamtübersicht</h1>

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
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
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

      {/* Tabs */}
      <section className="bg-white p-2 rounded-lg shadow">
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-md ${
              tab === "alle" ? "bg-[#0058A3] text-white" : "bg-gray-100"
            }`}
            onClick={() => setTab("alle")}
          >
            Alle
          </button>
          <button
            className={`px-4 py-2 rounded-md ${
              tab === "zukuenftig" ? "bg-[#0058A3] text-white" : "bg-gray-100"
            }`}
            onClick={() => setTab("zukuenftig")}
          >
            Zukünftig
          </button>
          <button
            className={`px-4 py-2 rounded-md ${
              tab === "vergangen" ? "bg-[#0058A3] text-white" : "bg-gray-100"
            }`}
            onClick={() => setTab("vergangen")}
          >
            Vergangen
          </button>
        </div>
      </section>

      {/* Mobile Cards */}
      <section className="md:hidden space-y-3">
        {loading && <div className="text-gray-500">Laden…</div>}
        {!loading && msg && <div className="text-gray-600">{msg}</div>}

        {!loading &&
          gefiltert.map((t) => {
            const open = openStops[t.id];
            const stopps = Array.isArray(open) ? open : null;
            return (
              <div key={t.id} className="bg-white border rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500">{fmtDate(t.datum)}</div>
                    <div className="text-base font-semibold text-[#0058A3]">
                      {t.fahrer_name}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      <b>{t.stopps_count ?? 0}</b> Stopps
                      {t.kunden_preview ? (
                        <span className="text-gray-500"> · {t.kunden_preview}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span
                      className={`text-xs rounded px-2 py-1 ${
                        String(t.datum) > todayISO
                          ? "bg-[#E8F8EE] text-[#137A4B]"
                          : String(t.datum) < todayISO
                          ? "bg-[#FCE8E8] text-[#9F1C1C]"
                          : "bg-[#E8F1FA] text-[#0058A3]"
                      }`}
                    >
                      {String(t.datum) > todayISO
                        ? "Zukünftig"
                        : String(t.datum) < todayISO
                        ? "Vergangen"
                        : "Heute"}
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    onClick={() => toggleStopps(t)}
                    className="w-full bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md text-sm"
                  >
                    {stopps ? "Stopps ausblenden" : "Stopps anzeigen"}
                  </button>
                </div>

                {stopps && (
                  <div className="mt-3 space-y-2">
                    {stopps.length === 0 && (
                      <div className="text-sm text-gray-500 italic">
                        Keine Stopps vorhanden
                      </div>
                    )}
                    {stopps.map((s) => (
                      <div key={s.id} className="border rounded-md p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs text-gray-500">
                              Pos. {Number.isFinite(s.position) ? s.position : "–"}
                            </div>
                            <div className="text-sm font-semibold text-[#0058A3] break-words">
                              {s.kunde || "—"}
                            </div>
                          </div>
                          {s.ankunft ? (
                            <span className="text-xs bg-[#E8F1FA] text-[#0058A3] px-2 py-1 rounded">
                              {s.ankunft}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex gap-2">
                            <span>📍</span>
                            {s.adresse ? (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  s.adresse
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-words"
                              >
                                {s.adresse}
                              </a>
                            ) : (
                              <span className="text-gray-500">Keine Adresse</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <span>📞</span>
                            {s.telefon ? (
                              <a className="text-blue-600 hover:underline" href={telHref(s.telefon)}>
                                {s.telefon}
                              </a>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </div>
                          {(s.kommission || s.hinweis) && (
                            <div className="flex gap-2">
                              <span>📝</span>
                              <span className="break-words">
                                {s.kommission || s.hinweis}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </section>

      {/* Desktop Tabelle */}
      <section className="hidden md:block bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Touren (Tabelle)</h2>
        {loading && <div className="text-gray-500">Laden…</div>}
        {!loading && msg && <div className="text-gray-600">{msg}</div>}

        {!loading && gefiltert.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="border px-2 py-1 text-left">Datum</th>
                  <th className="border px-2 py-1 text-left">Fahrer</th>
                  <th className="border px-2 py-1 text-left">Stopps</th>
                  <th className="border px-2 py-1 text-left">Kunden (Auszug)</th>
                  <th className="border px-2 py-1 text-left">Status</th>
                  <th className="border px-2 py-1 text-left">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1">{fmtDate(t.datum)}</td>
                    <td className="border px-2 py-1">{t.fahrer_name}</td>
                    <td className="border px-2 py-1">{t.stopps_count}</td>
                    <td className="border px-2 py-1">
                      {t.kunden_preview || <span className="text-gray-400">–</span>}
                    </td>
                    <td className="border px-2 py-1">
                      {String(t.datum) > todayISO ? (
                        <span className="text-xs rounded px-2 py-1 bg-[#E8F8EE] text-[#137A4B]">
                          Zukünftig
                        </span>
                      ) : String(t.datum) < todayISO ? (
                        <span className="text-xs rounded px-2 py-1 bg-[#FCE8E8] text-[#9F1C1C]">
                          Vergangen
                        </span>
                      ) : (
                        <span className="text-xs rounded px-2 py-1 bg-[#E8F1FA] text-[#0058A3]">
                          Heute
                        </span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      <button
                        onClick={() => toggleStopps(t)}
                        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      >
                        {openStops[t.id] ? "Stopps ausblenden" : "Stopps anzeigen"}
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Unterzeilen: Stopps (wenn geöffnet) */}
                {gefiltert.map((t) => {
                  const stopps = Array.isArray(openStops[t.id]) ? openStops[t.id] : null;
                  if (!stopps) return null;
                  return (
                    <tr key={`${t.id}-stopps`}>
                      <td className="border px-2 py-2 bg-gray-50" colSpan={6}>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border text-sm">
                            <thead className="bg-gray-200">
                              <tr>
                                <th className="border px-2 py-1 text-left">Pos</th>
                                <th className="border px-2 py-1 text-left">Kunde</th>
                                <th className="border px-2 py-1 text-left">Adresse</th>
                                <th className="border px-2 py-1 text-left">Telefon</th>
                                <th className="border px-2 py-1 text-left">Kommission</th>
                                <th className="border px-2 py-1 text-left">Hinweis</th>
                                <th className="border px-2 py-1 text-left">Ankunft</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stopps.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="text-center py-2 text-gray-500">
                                    Keine Stopps
                                  </td>
                                </tr>
                              )}
                              {stopps.map((s) => (
                                <tr key={s.id} className="hover:bg-white">
                                  <td className="border px-2 py-1 w-16 text-center">
                                    {Number.isFinite(s.position) ? s.position : ""}
                                  </td>
                                  <td className="border px-2 py-1">{s.kunde}</td>
                                  <td className="border px-2 py-1">
                                    {s.adresse ? (
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                          s.adresse
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline break-words"
                                      >
                                        {s.adresse}
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {s.telefon ? (
                                      <a className="text-blue-600 hover:underline" href={telHref(s.telefon)}>
                                        {s.telefon}
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {s.kommission || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {s.hinweis || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="border px-2 py-1">{s.ankunft || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
