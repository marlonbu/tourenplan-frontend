// src/pages/Tagestour.jsx
import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// ---------- Fester Startpunkt (Firma) ----------
const START_ADRESSE = "Hans Gehlenborg GmbH, Fehnstraße 3, 49699 Lindern";
// Fixe Koordinaten (lat, lng)
const FIRMA_COORDS = [52.8413511, 7.7705647];
const GMAPS_ORIGIN = `${FIRMA_COORDS[0]},${FIRMA_COORDS[1]}`;

// ---------- Icons ----------
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const startDivIcon = L.divIcon({
  className: "start-marker",
  html: `<div style="
    font-size:24px;
    line-height:24px;
    transform: translate(-12px, -12px);
  ">🏭</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// ---------- Hilfskomponente: auf Route/Marker zoomen ----------
function FitToBounds({ lineCoords, markerCoords }) {
  const map = useMap();
  useEffect(() => {
    const points =
      lineCoords && lineCoords.length > 0 ? lineCoords : markerCoords || [];
    if (points.length > 0) {
      const bounds = L.latLngBounds(
        points.map(([lat, lon]) => L.latLng(lat, lon))
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [lineCoords, markerCoords, map]);
  return null;
}

// ---------- Utils ----------
async function geocodeAdresse(addr) {
  if (!addr) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    addr
  )}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  if (json && json[0]) {
    return [parseFloat(json[0].lat), parseFloat(json[0].lon)]; // [lat, lon]
  }
  return null;
}

function telHref(raw) {
  if (!raw) return "";
  const cleaned = raw.replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
}

// Google-Maps URL: origin = Firma (Koordinaten), destination = letzter Stopp, waypoints = restliche Stopps
function buildGoogleMapsRouteURL(startOrigin, stopps) {
  const addrs = (stopps || [])
    .map((s) => s?.adresse)
    .filter(Boolean);

  if (addrs.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      startOrigin
    )}`;
  }

  const origin = encodeURIComponent(startOrigin);
  const destination = encodeURIComponent(addrs[addrs.length - 1]);
  const waypoints =
    addrs.length > 1
      ? `&waypoints=${encodeURIComponent(addrs.slice(0, -1).join("|"))}`
      : "";

  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${origin}&destination=${destination}${waypoints}`;
}

// OSRM-Routenabfrage (Straßenroute). Erwartet coords: [[lat, lon], ...] in Reihenfolge.
async function fetchOsrmRoute(coords) {
  if (!coords || coords.length < 2) return null;
  const path = coords.map(([lat, lon]) => `${lon},${lat}`).join(";"); // OSRM will lon,lat
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const line =
    data?.routes?.[0]?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]) ||
    [];
  return line.length ? line : null;
}

export default function Tagestour() {
  const [fahrer, setFahrer] = useState([]);
  const [selectedFahrer, setSelectedFahrer] = useState("");
  const [datum, setDatum] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [tour, setTour] = useState(null);

  const [stopps, setStopps] = useState([]); // rohe Stopps aus API
  const [startCoord, setStartCoord] = useState(null); // Koordinate Firma
  const [geoStopps, setGeoStopps] = useState([]); // [{ stopp, coord|null }]
  const [markerCoords, setMarkerCoords] = useState([]); // nur vorhandene Koordinaten (Start + Stopps)
  const [routeCoords, setRouteCoords] = useState([]); // OSRM-Linie

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Autosave-Status für "Anmerkung Fahrer"
  const [saveState, setSaveState] = useState({}); // { [id]: "saving"|"saved"|"error"|"idle" }
  const timersRef = useRef({}); // Debounce Timer je Stopp-ID

  // ------- Fotos pro Stopp -------
  // fotosMap: { [stoppId]: [{id, url, created_at}] }
  const [fotosMap, setFotosMap] = useState({});
  // busy: { [stoppId]: boolean } während Upload/Laden
  const [fotoBusy, setFotoBusy] = useState({});

  useEffect(() => {
    ladeFahrer();
  }, []);

  async function ladeFahrer() {
    try {
      const data = await api.listFahrer();
      setFahrer(data);
    } catch (err) {
      console.error("Fehler beim Laden der Fahrer:", err);
      setMsg("❌ Fahrer konnten nicht geladen werden");
    }
  }

  async function ladeTour() {
    if (!selectedFahrer || !datum) {
      alert("Bitte Fahrer und Datum auswählen!");
      return;
    }

    setLoading(true);
    setSaveState({});
    setRouteCoords([]);
    setMarkerCoords([]);
    setGeoStopps([]);
    setStartCoord(null);
    setFotosMap({});
    setFotoBusy({});

    try {
      const data = await api.getTour(selectedFahrer, datum);
      setTour(data.tour);
      const s = data.stopps || [];
      setStopps(s);
      setMsg(data.tour ? "✅ Tour geladen" : "ℹ️ Keine Tour gefunden");

      // 1) Firma: feste Koordinaten verwenden
      const firmCoord = FIRMA_COORDS;
      setStartCoord(firmCoord);

      // 2) Stopps geokodieren (einzeln; Reihenfolge bleibt)
      const geos = [];
      for (const st of s) {
        if (!st?.adresse) {
          geos.push({ stopp: st, coord: null });
          continue;
        }
        try {
          const c = await geocodeAdresse(st.adresse);
          geos.push({ stopp: st, coord: c });
        } catch {
          geos.push({ stopp: st, coord: null });
        }
      }
      setGeoStopps(geos);

      // 3) Marker
      const mCoords = [
        ...(firmCoord ? [firmCoord] : []),
        ...geos.filter((g) => !!g.coord).map((g) => g.coord),
      ];
      setMarkerCoords(mCoords);

      // 4) Route (OSRM)
      const routeInput = [firmCoord, ...geos.map((g) => g.coord).filter(Boolean)].filter(
        Boolean
      );

      if (routeInput.length >= 2) {
        const line = await fetchOsrmRoute(routeInput);
        if (line && line.length) {
          setRouteCoords(line);
        } else {
          setRouteCoords(routeInput); // Fallback
        }
      } else {
        setRouteCoords([]);
      }

      // 5) Fotos je Stopp (nacheinander)
      for (const st of s) {
        await ladeFotos(st.id);
      }
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Tour konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  // ---- Fotos laden/aktualisieren ----
  async function ladeFotos(stoppId) {
    try {
      setFotoBusy((b) => ({ ...b, [stoppId]: true }));
      const arr = await api.getStoppFotos(stoppId);
      setFotosMap((m) => ({ ...m, [stoppId]: arr || [] }));
    } catch (e) {
      console.error("Fotos laden fehlgeschlagen:", e);
    } finally {
      setFotoBusy((b) => ({ ...b, [stoppId]: false }));
    }
  }

  async function uploadFoto(stoppId, fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;
    try {
      setFotoBusy((b) => ({ ...b, [stoppId]: true }));
      await api.uploadStoppFoto(stoppId, file);
      fileInput.value = ""; // Input zurücksetzen
      await ladeFotos(stoppId); // neu laden
    } catch (e) {
      console.error(e);
      alert(e?.message || "Foto-Upload fehlgeschlagen");
    } finally {
      setFotoBusy((b) => ({ ...b, [stoppId]: false }));
    }
  }

  async function deleteFoto(fotoId, stoppId) {
    const ok = confirm("Foto wirklich löschen?");
    if (!ok) return;
    try {
      setFotoBusy((b) => ({ ...b, [stoppId]: true }));
      await api.deleteStoppFoto(fotoId);
      setFotosMap((m) => ({
        ...m,
        [stoppId]: (m[stoppId] || []).filter((f) => f.id !== fotoId),
      }));
      await ladeFotos(stoppId);
    } catch (e) {
      console.error(e);
      alert("Foto konnte nicht gelöscht werden");
    } finally {
      setFotoBusy((b) => ({ ...b, [stoppId]: false }));
    }
  }

  // Eingabe-Handler für "Anmerkung Fahrer" (Autosave)
  function handleAnmerkungChange(id, value) {
    setStopps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, anmerkung_fahrer: value } : s))
    );

    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    setSaveState((st) => ({ ...st, [id]: "saving" }));

    timersRef.current[id] = setTimeout(() => saveAnmerkung(id, value), 1000);
  }

  function handleAnmerkungBlur(id, value) {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    saveAnmerkung(id, value);
  }

  async function saveAnmerkung(id, value) {
    try {
      await api.updateStoppAnmerkung(id, value);
      setSaveState((st) => ({ ...st, [id]: "saved" }));
      setTimeout(() => setSaveState((st) => ({ ...st, [id]: "idle" })), 1500);
    } catch (err) {
      console.error("Anmerkung speichern fehlgeschlagen:", err);
      setSaveState((st) => ({ ...st, [id]: "error" }));
    }
  }

  // Google-Maps Button URL (Firma -> ... -> letzter Kunde), Origin via Koordinaten
  const gmapsUrl = buildGoogleMapsRouteURL(GMAPS_ORIGIN, stopps);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#0058A3]">Tagestour</h1>

      {/* Auswahl */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Tour laden</h2>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="text-sm text-gray-600 block">Fahrer</label>
            <select
              className="border rounded-md px-3 py-2 w-full min-h-[44px]"
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

          <div>
            <label className="text-sm text-gray-600 block">Datum</label>
            <input
              type="date"
              className="border rounded-md px-3 py-2 min-h-[44px]"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>

          <button
            onClick={ladeTour}
            className="bg-[#0058A3] text-white px-4 py-2 rounded-md hover:bg-blue-800 min-h-[44px]"
          >
            Tour laden
          </button>
        </div>

        {tour && (
          <div className="mt-4 text-sm text-gray-700 grid gap-1 sm:grid-cols-3">
            <div><b>Tour-ID:</b> {tour.id}</div>
            <div><b>Fahrer:</b> {fahrer.find((f) => f.id === tour.fahrer_id)?.name}</div>
            <div><b>Datum:</b> {tour.datum}</div>
          </div>
        )}
      </section>

      {/* Stopps */}
      {tour && (
        <>
          <section className="bg-white p-4 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-medium text-[#0058A3]">Stopps dieser Tour</h2>

            {/* Tabelle: mobil scrollbar */}
            <div className="overflow-x-auto -mx-2 md:mx-0">
              <table className="min-w-[1000px] w-full border text-sm md:text-[15px] mx-2 md:mx-0">
                <thead className="bg-[#0058A3] text-white">
                  <tr>
                    <th className="border px-2 py-2">Pos</th>
                    <th className="border px-2 py-2">Ankunft</th>
                    <th className="border px-2 py-2">Kunde</th>
                    <th className="border px-2 py-2">Adresse</th>
                    <th className="border px-2 py-2">Telefon</th>
                    <th className="border px-2 py-2">Kommission</th>
                    <th className="border px-2 py-2">Hinweis</th>
                    <th className="border px-2 py-2">Fotos</th>
                    <th className="border px-2 py-2">Anmerkung Fahrer</th>
                  </tr>
                </thead>
                <tbody>
                  {stopps.length === 0 && (
                    <tr>
                      <td colSpan="9" className="text-center py-3 text-gray-500 italic">
                        Keine Stopps vorhanden
                      </td>
                    </tr>
                  )}
                  {stopps.map((s, i) => {
                    const fotos = fotosMap[s.id] || [];
                    const busy = !!fotoBusy[s.id];
                    const inputId = `foto-input-${s.id}`;
                    const count = fotos.length;
                    return (
                      <tr key={s.id || i} className="hover:bg-gray-50 align-top">
                        <td className="border px-2 py-2 text-center">{s.position}</td>
                        <td className="border px-2 py-2">{s.ankunft || ""}</td>
                        <td className="border px-2 py-2">{s.kunde}</td>
                        <td className="border px-2 py-2">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              s.adresse || ""
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline break-words"
                          >
                            {s.adresse}
                          </a>
                        </td>
                        <td className="border px-2 py-2">
                          {s.telefon ? (
                            <a
                              href={telHref(s.telefon)}
                              className="text-blue-600 hover:underline"
                            >
                              {s.telefon}
                            </a>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="border px-2 py-2">{s.kommission}</td>
                        <td className="border px-2 py-2">{s.hinweis}</td>

                        {/* Fotos-Spalte */}
                        <td className="border px-2 py-2 w-[260px]">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Thumbnails */}
                            {fotos.map((f) => (
                              <div
                                key={f.id}
                                className="relative group border rounded-md overflow-hidden"
                                style={{ width: 56, height: 56 }}
                              >
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ansehen/Download"
                                >
                                  <img
                                    src={f.url}
                                    alt="Stopp-Foto"
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                                <button
                                  title="Foto löschen"
                                  onClick={() => deleteFoto(f.id, s.id)}
                                  className="absolute -top-2 -right-2 bg-white rounded-full shadow px-1 text-xs hover:bg-red-50"
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}

                            {/* 📷 Upload-Button */}
                            <label
                              htmlFor={inputId}
                              className={`cursor-pointer inline-flex items-center justify-center border rounded-md px-2 py-2 select-none ${
                                count >= 3 || busy
                                  ? "opacity-50 pointer-events-none"
                                  : "hover:bg-gray-50"
                              }`}
                              title={count >= 3 ? "Maximal 3 Fotos" : "Foto aufnehmen/auswählen"}
                            >
                              <span className="text-lg">📷</span>
                            </label>
                            <input
                              id={inputId}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => uploadFoto(s.id, e.target)}
                            />
                            <span className="text-xs text-gray-600">{count}/3</span>
                            {busy && <span className="text-xs text-gray-500">…</span>}
                          </div>
                        </td>

                        <td className="border px-2 py-2 w-[280px] md:w-[320px]">
                          <textarea
                            className="border rounded-md px-2 py-2 w-full resize-y min-h-[44px]"
                            placeholder='z. B. "ok" oder Problem notieren'
                            value={s.anmerkung_fahrer || ""}
                            onChange={(e) =>
                              handleAnmerkungChange(s.id, e.target.value)
                            }
                            onBlur={(e) => handleAnmerkungBlur(s.id, e.target.value)}
                          />
                          <div className="text-xs mt-1 h-4">
                            {saveState[s.id] === "saving" && (
                              <span className="text-gray-500">💾 Speichern…</span>
                            )}
                            {saveState[s.id] === "saved" && (
                              <span className="text-green-600">✅ Gespeichert</span>
                            )}
                            {saveState[s.id] === "error" && (
                              <span className="text-red-600">❌ Fehler</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Google Maps Button */}
          <div className="w-full flex items-center justify-center">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#0058A3] text-white px-5 py-3 rounded-md shadow hover:bg-blue-800 min-h-[44px]"
            >
              Tour in Google Maps öffnen
            </a>
          </div>

          {/* Karte */}
          <section className="bg-white p-4 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-medium text-[#0058A3]">Karte</h2>

            {loading ? (
              <div className="text-gray-500 italic text-center py-10">
                Karte wird geladen …
              </div>
            ) : (
              <div className="w-full" style={{ height: "60vh", maxHeight: 560 }}>
                <MapContainer
                  center={FIRMA_COORDS}
                  zoom={12}
                  style={{
                    height: "100%",
                    width: "100%",
                    borderRadius: "10px",
                  }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {/* Startpunkt (Firma) */}
                  {startCoord && (
                    <Marker position={startCoord} icon={startDivIcon}>
                      <Popup>
                        <b>Start</b>
                        <br />
                        {START_ADRESSE}
                        <br />
                        {FIRMA_COORDS[0].toFixed(6)}, {FIRMA_COORDS[1].toFixed(6)}
                      </Popup>
                    </Marker>
                  )}

                  {/* Kundenstopps */}
                  {geoStopps
                    .filter((g) => !!g.coord)
                    .map(({ stopp, coord }, idx) => (
                      <Marker
                        key={stopp.id || idx}
                        position={coord}
                        icon={defaultIcon}
                      >
                        <Popup>
                          <div className="text-sm">
                            <b>{stopp.kunde}</b>
                            <br />
                            {stopp.adresse}
                            <br />
                            Pos: {stopp.position ?? ""}
                            {stopp.ankunft ? (
                              <>
                                <br />
                                Ankunft: <b>{stopp.ankunft}</b>
                              </>
                            ) : null}
                            {stopp.anmerkung_fahrer ? (
                              <>
                                <br />
                                <i>Anmerkung: {stopp.anmerkung_fahrer}</i>
                              </>
                            ) : null}
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                  {/* Route (OSRM) */}
                  {routeCoords.length > 0 && (
                    <>
                      <Polyline positions={routeCoords} />
                      <FitToBounds
                        lineCoords={routeCoords}
                        markerCoords={markerCoords}
                      />
                    </>
                  )}

                  {/* Falls OSRM nichts liefert */}
                  {routeCoords.length === 0 && markerCoords.length > 0 && (
                    <FitToBounds markerCoords={markerCoords} />
                  )}
                </MapContainer>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
