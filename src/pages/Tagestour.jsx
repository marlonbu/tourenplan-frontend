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
  html: `<div style="font-size:24px;line-height:24px;transform: translate(-12px, -12px);">🏭</div>`,
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

// Google-Maps URL: origin = Firma (Koordinaten), destination = letzter Stopp
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

// OSRM-Routenabfrage
async function fetchOsrmRoute(coords) {
  if (!coords || coords.length < 2) return null;
  const path = coords.map(([lat, lon]) => `${lon},${lat}`).join(";");
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

  // Fotos-Cache: stoppId -> [{id,url,created_at}]
  const [fotosMap, setFotosMap] = useState({}); 

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

    try {
      const data = await api.getTour(selectedFahrer, datum);
      setTour(data.tour);
      const s = data.stopps || [];
      setStopps(s);
      setMsg(data.tour ? "✅ Tour geladen" : "ℹ️ Keine Tour gefunden");

      // Firma: feste Koordinaten
      const firmCoord = FIRMA_COORDS;
      setStartCoord(firmCoord);

      // Stopps geokodieren
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

      // Fotos je Stopp laden
      const fotosEntries = await Promise.all(
        s.map(async (st) => {
          try {
            const f = await api.getStoppFotos(st.id);
            return [st.id, f];
          } catch {
            return [st.id, []];
          }
        })
      );
      const map = Object.fromEntries(fotosEntries);
      setFotosMap(map);

      // Marker
      const mCoords = [
        firmCoord,
        ...geos.filter((g) => !!g.coord).map((g) => g.coord),
      ].filter(Boolean);
      setMarkerCoords(mCoords);

      // Route
      const routeInput = [firmCoord, ...geos.map((g) => g.coord).filter(Boolean)];
      if (routeInput.length >= 2) {
        const line = await fetchOsrmRoute(routeInput);
        setRouteCoords(line && line.length ? line : routeInput);
      } else {
        setRouteCoords([]);
      }
    } catch (err) {
      console.error("Fehler:", err);
      setMsg("❌ Tour konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  // "Anmerkung Fahrer" (Autosave)
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

  // Fotos: Upload / Delete
  async function handleFotoUpload(stoppId, e) {
    const file = e.target.files?.[0];
    // Input sofort leeren, damit derselbe Dateiname erneut gewählt werden kann
    e.target.value = "";

    if (!file) return;

    try {
      // 3er-Limit clientseitig prüfen
      const cur = fotosMap[stoppId] || [];
      if (cur.length >= 3) {
        alert("Maximal 3 Fotos pro Stopp.");
        return;
      }

      await api.uploadStoppFoto(stoppId, file);
      const refreshed = await api.getStoppFotos(stoppId);
      setFotosMap((m) => ({ ...m, [stoppId]: refreshed }));
    } catch (err) {
      console.error("Foto-Upload fehlgeschlagen:", err);
      alert(`❌ Foto-Upload fehlgeschlagen: ${err?.message || err}`);
    }
  }

  async function handleFotoDelete(fotoId, stoppId) {
    if (!confirm("Foto wirklich löschen?")) return;
    try {
      await api.deleteStoppFoto(fotoId);
      const refreshed = await api.getStoppFotos(stoppId);
      setFotosMap((m) => ({ ...m, [stoppId]: refreshed }));
    } catch (err) {
      console.error("Foto löschen fehlgeschlagen:", err);
      alert("❌ Foto konnte nicht gelöscht werden");
    }
  }

  // Google-Maps Button
  const gmapsUrl = buildGoogleMapsRouteURL(GMAPS_ORIGIN, stopps);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tagestour</h1>

      {/* Auswahl */}
      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-medium text-[#0058A3]">Tour laden</h2>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-gray-600 block">Fahrer</label>
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
            onClick={ladeTour}
            className="bg-[#0058A3] text-white px-4 py-2 rounded-md hover:bg-blue-800"
          >
            Tour laden
          </button>
        </div>

        {tour && (
          <div className="mt-4 text-sm text-gray-700">
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

            <table className="min-w-full border text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="border px-2 py-1">Pos</th>
                  <th className="border px-2 py-1">Ankunft</th>
                  <th className="border px-2 py-1">Kunde</th>
                  <th className="border px-2 py-1">Adresse</th>
                  <th className="border px-2 py-1">Telefon</th>
                  <th className="border px-2 py-1">Kommission</th>
                  <th className="border px-2 py-1">Hinweis</th>
                  <th className="border px-2 py-1">📷</th>
                  <th className="border px-2 py-1">Anmerkung Fahrer</th>
                </tr>
              </thead>
              <tbody>
                {stopps.length === 0 && (
                  <tr>
                    <td colSpan="9" className="text-center py-2 text-gray-500 italic">
                      Keine Stopps vorhanden
                    </td>
                  </tr>
                )}
                {stopps.map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-gray-50 align-top">
                    <td className="border px-2 py-1 text-center">{s.position}</td>
                    <td className="border px-2 py-1">{s.ankunft || ""}</td>
                    <td className="border px-2 py-1">{s.kunde}</td>
                    <td className="border px-2 py-1">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          s.adresse || ""
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {s.adresse}
                      </a>
                    </td>
                    <td className="border px-2 py-1">
                      {s.telefon ? (
                        <a href={telHref(s.telefon)} className="text-blue-600 hover:underline">
                          {s.telefon}
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="border px-2 py-1">{s.kommission}</td>
                    <td className="border px-2 py-1">{s.hinweis}</td>

                    {/* 📷 Foto-Spalte */}
                    <td className="border px-2 py-1 w-[260px]">
                      {/* Upload Button */}
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">
                          📷 Foto
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={(e) => handleFotoUpload(s.id, e)}
                        />
                      </label>

                      {/* Mini-Galerie */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(fotosMap[s.id] || []).map((f) => (
                          <div key={f.id} className="relative">
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Im neuen Tab öffnen"
                            >
                              <img
                                src={f.url}
                                alt="Stopp-Foto"
                                className="w-20 h-20 object-cover rounded border"
                              />
                            </a>
                            <button
                              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 text-xs"
                              title="Foto löschen"
                              onClick={() => handleFotoDelete(f.id, s.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Anmerkung */}
                    <td className="border px-2 py-1 w-[260px]">
                      <textarea
                        className="border rounded-md px-2 py-1 w-full resize-y min-h-[34px]"
                        placeholder='z. B. "ok" oder Problem notieren'
                        value={s.anmerkung_fahrer || ""}
                        onChange={(e) => handleAnmerkungChange(s.id, e.target.value)}
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
                ))}
              </tbody>
            </table>
          </section>

          {/* Google Maps Button */}
          <div className="w-full flex items-center justify-center">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#0058A3] text-white px-5 py-2 rounded-md shadow hover:bg-blue-800"
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
              <div style={{ height: "520px", width: "100%" }}>
                <MapContainer
                  center={FIRMA_COORDS}
                  zoom={12}
                  style={{ height: "100%", width: "100%", borderRadius: "10px" }}
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
                      <Marker key={stopp.id || idx} position={coord} icon={defaultIcon}>
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

                  {/* Route */}
                  {routeCoords.length > 0 && (
                    <>
                      <Polyline positions={routeCoords} />
                      <FitToBounds lineCoords={routeCoords} markerCoords={markerCoords} />
                    </>
                  )}
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
