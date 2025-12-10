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

// === NEW: PDF / QR ===
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

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
  const cleaned = String(raw).replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
}

function fmtDE(d) {
  try {
    return new Date(d).toLocaleDateString("de-DE");
  } catch {
    return d;
  }
}

function kwFromDateISO(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    // ISO-Woche
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const firstThursdayDayNr = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstThursdayDayNr + 3);
    const week =
      1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
    const year = target.getFullYear();
    return { week, year };
  } catch {
    return null;
  }
}

/**
 * Google-Maps URL:
 * origin   = Firma (Koordinaten)
 * waypoints= alle Kundenstopps in Reihenfolge
 * destination = Firma (Textadresse)
 * --> Route: Firma -> ...Stopps... -> Firma (Rückweg)
 * Hinweis: Das beeinflusst NICHT die OSRM/OSM-Karte.
 */
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
  const destination = encodeURIComponent(START_ADRESSE);
  const waypoints = `&waypoints=${encodeURIComponent(addrs.join("|"))}`;

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
  const [fotosMap, setFotosMap] = useState({});
  const [fotoBusy, setFotoBusy] = useState({});
  const fileInputRefs = useRef({});

  // Bottom-Action-Bar
  const [showQuickPhoto, setShowQuickPhoto] = useState(false);
  const [showCallSheet, setShowCallSheet] = useState(false);

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

      // 1) Firma: feste Koordinaten
      const firmCoord = FIRMA_COORDS;
      setStartCoord(firmCoord);

      // 2) Stopps geokodieren
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

      // 4) Route (OSRM) – KEIN Rückweg zur Firma (nur OSM-Anzeige)
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

      // 5) Fotos je Stopp
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
      fileInput.value = "";
      await ladeFotos(stoppId);
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

  // Google-Maps Button URL (Firma -> Stopps -> Firma/Rückweg)
  const gmapsUrl = buildGoogleMapsRouteURL(GMAPS_ORIGIN, stopps);

  // Quick-Foto trigger
  function triggerQuickPhoto(stoppId) {
    const el =
      document.getElementById(`foto-input-${stoppId}`) ||
      fileInputRefs.current[stoppId];
    if (el) el.click();
    setShowQuickPhoto(false);
  }

  const stoppsMitTelefon = stopps.filter((s) => !!s.telefon);

  // === NEW: PDF Export ===
  async function handleExportPdf() {
    if (!tour) {
      alert("Bitte zuerst eine Tour laden.");
      return;
    }
    try {
      // Basis
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Farben/Typo
      const blue = [0, 88, 163]; // #0058A3
      const lightBlue = [232, 241, 250]; // #E8F1FA

      // Banner oben (Titel + QR)
      const bannerH = 86;
      doc.setFillColor(...lightBlue);
      doc.rect(0, 0, pageWidth, bannerH, "F");

      doc.setTextColor(...blue);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text("Tagestour – Übersicht", 46, 52);

      // QR rechts im Banner + Label
      const gmaps = gmapsUrl;
      const qrDataUrl = await QRCode.toDataURL(gmaps, { margin: 1, width: 130 });
      const qrW = 100;
      const qrX = pageWidth - 46 - qrW;
      const qrY = 12;
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrW, qrW);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      doc.text("Tour in Google Maps öffnen", qrX + qrW / 2, qrY + qrW + 14, {
        align: "center",
      });

      // Meta unter dem Banner (einheitlicher Zeilenabstand)
      const metaStartY = bannerH + 18;
      const metaLine = 20;
      const fahrerName =
        fahrer.find((f) => f.id === tour.fahrer_id)?.name || "—";
      const kwObj = kwFromDateISO(tour.datum);
      const kwText = kwObj ? `KW ${String(kwObj.week).padStart(2, "0")}` : "—";
      const bemerkung = tour.bemerkung || "—";

      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Datum:", 46, metaStartY);
      doc.text("Fahrer:", 46, metaStartY + metaLine);
      doc.text("Kalenderwoche:", 46, metaStartY + metaLine * 2);
      doc.text("Bemerkung:", 46, metaStartY + metaLine * 3);

      doc.setFont("helvetica", "normal");
      doc.text(fmtDE(tour.datum), 130, metaStartY);
      doc.text(fahrerName, 130, metaStartY + metaLine);
      doc.text(kwText, 130, metaStartY + metaLine * 2);

      // Bemerkung ggf. umbrochen
      const bemX = 130;
      const bemY = metaStartY + metaLine * 3;
      const bemMaxW = pageWidth - 46 - 46 - 84;
      const bemWrapped = doc.splitTextToSize(bemerkung, bemMaxW);
      doc.text(bemWrapped, bemX, bemY);

      // Tabelle direkt darunter starten
      const tableStartY = bemY + (bemWrapped.length > 1 ? 16 + (bemWrapped.length - 1) * 14 : 16);

      // Tabellendaten
      const head = [["Pos", "Ankunft", "Kunde", "Adresse", "Telefon", "Kommission", "Hinweis"]];
      const body = (stopps || []).map((s, i) => [
        Number.isFinite(s.position) ? String(s.position) : String(i + 1),
        s.ankunft || "",
        s.kunde || "",
        s.adresse || "",
        s.telefon || "",
        s.kommission || "",
        s.hinweis || "",
      ]);

      // Spaltenbreiten so, dass nichts abgeschnitten wird (A4 quer, Ränder 40 px)
      // verfügbare Breite ~ 842 - 80 = 762 pt
      const margin = { left: 40, right: 40, top: 40, bottom: 40 };
      const colWidths = {
        0: 35,  // Pos
        1: 70,  // Ankunft
        2: 110, // Kunde
        3: 210, // Adresse
        4: 95,  // Telefon
        5: 110, // Kommission
        6: 110, // Hinweis
      };

      autoTable(doc, {
        head,
        body,
        startY: Math.max(tableStartY, bannerH + 8),
        margin,
        tableWidth: "auto",
        styles: {
          font: "helvetica",
          fontSize: 11,               // etwas größer gewünscht
          cellPadding: 6,
          valign: "top",
          overflow: "linebreak",      // Umbruch aktiv
          lineColor: [210, 210, 210],
          lineWidth: 0.6,
          minCellHeight: 18,
          textColor: [40, 40, 40],
        },
        headStyles: {
          fillColor: blue,
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252], // sehr hell
        },
        columnStyles: {
          0: { cellWidth: colWidths[0], halign: "center" },
          1: { cellWidth: colWidths[1] },
          2: { cellWidth: colWidths[2] },
          3: { cellWidth: colWidths[3] }, // Adresse darf umbrechen
          4: { cellWidth: colWidths[4] },
          5: { cellWidth: colWidths[5] }, // Kommission umbrechen
          6: { cellWidth: colWidths[6] }, // Hinweis umbrechen
        },
        theme: "grid",
        didDrawPage: (data) => {
          // Fußzeile
          const ts = new Date().toLocaleString("de-DE");
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text(`Erstellt am ${ts}`, 46, pageHeight - 18);
        },
      });

      doc.save(
        `Tagestour_${fmtDE(tour.datum)}_${fahrerName.replace(/\s+/g, "_")}.pdf`
      );
    } catch (e) {
      console.error(e);
      alert("PDF konnte nicht erstellt werden.");
    }
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* pb-24: Platz für Bottom Action-Bar auf Mobil */}
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

      {/* === NEU: Buttonzeile (zentriert, zwei Buttons) === */}
      {tour && (
        <div className="w-full flex items-center justify-center gap-3">
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#0058A3] text-white px-5 py-3 rounded-md shadow hover:bg-blue-800 min-h-[44px]"
          >
            Tour in Google Maps öffnen
          </a>
          <button
            onClick={handleExportPdf}
            className="inline-block bg-[#0058A3] text-white px-5 py-3 rounded-md shadow hover:bg-blue-800 min-h-[44px]"
          >
            PDF erstellen
          </button>
        </div>
      )}

      {/* Stopps */}
      {tour && (
        <>
          {/* ---- MOBILE: Card-Ansicht (unter md) ---- */}
          <section className="md:hidden space-y-3">
            {stopps.length === 0 && (
              <div className="bg-white p-4 rounded-lg shadow text-gray-500 italic">
                Keine Stopps vorhanden
              </div>
            )}

            {stopps.map((s) => {
              const fotos = fotosMap[s.id] || [];
              const busy = !!fotoBusy[s.id];
              const inputId = `foto-input-${s.id}`;
              const count = fotos.length;
              return (
                <div key={s.id} className="bg-white rounded-lg shadow p-4 space-y-3">
                  {/* Kopf */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Pos. {s.position ?? "-"}</div>
                      <div className="text-base font-semibold">{s.kunde}</div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          s.adresse || ""
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-words"
                      >
                        {s.adresse}
                      </a>
                      {s.telefon ? (
                        <div className="mt-1">
                          <a href={telHref(s.telefon)} className="text-sm text-blue-600 hover:underline">
                            {s.telefon}
                          </a>
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      {s.ankunft ? (
                        <div>
                          <span className="font-medium">Ankunft:</span> {s.ankunft}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Kommission: </span>
                      <span>{s.kommission || "–"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Hinweis: </span>
                      <span>{s.hinweis || "–"}</span>
                    </div>
                  </div>

                  {/* Fotos */}
                  <div className="flex flex-wrap items-center gap-2">
                    {fotos.map((f) => (
                      <div
                        key={f.id}
                        className="relative group border rounded-md overflow-hidden"
                        style={{ width: 64, height: 64 }}
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

                    {/* Upload */}
                    <label
                      htmlFor={inputId}
                      className={`cursor-pointer inline-flex items-center justify-center border rounded-md px-3 py-2 select-none ${
                        count >= 3 || busy ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
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
                      ref={(el) => (fileInputRefs.current[s.id] = el)}
                      onChange={(e) => uploadFoto(s.id, e.target)}
                    />
                    <span className="text-xs text-gray-600">{count}/3</span>
                    {busy && <span className="text-xs text-gray-500">…</span>}
                  </div>

                  {/* Anmerkung Fahrer */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Anmerkung Fahrer</label>
                    <textarea
                      className="border rounded-md px-2 py-2 w-full resize-y min-h-[48px]"
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
                  </div>
                </div>
              );
            })}
          </section>

          {/* ---- DESKTOP: Tabelle (ab md) ---- */}
          <section className="hidden md:block bg-white p-4 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-medium text-[#0058A3]">Stopps dieser Tour</h2>
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
                              ref={(el) => (fileInputRefs.current[s.id] = el)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

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

      {/* ====== FIXE BOTTOM ACTION-BAR (nur mobil) ====== */}
      {tour && (
        <>
          <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
            <div className="max-w-6xl mx-auto px-3 py-2 grid grid-cols-3 gap-2">
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-md bg-[#0058A3] text-white py-2"
              >
                🗺️ <span className="text-sm font-medium">Route</span>
              </a>

              <button
                className="flex items-center justify-center gap-2 rounded-md bg-gray-100 text-gray-800 py-2"
                onClick={() => setShowQuickPhoto(true)}
              >
                📷 <span className="text-sm font-medium">Foto</span>
              </button>

              <button
                className="flex items-center justify-center gap-2 rounded-md bg-gray-100 text-gray-800 py-2"
                onClick={() => setShowCallSheet(true)}
              >
                📞 <span className="text-sm font-medium">Anrufen</span>
              </button>
            </div>
          </div>

          {/* Schnell-Foto: Auswahl Sheet */}
          {showQuickPhoto && (
            <div className="md:hidden fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowQuickPhoto(false)}
              />
              <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-auto shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-[#0058A3]">Schnell-Foto</h3>
                  <button
                    className="text-sm bg-gray-200 px-3 py-1 rounded"
                    onClick={() => setShowQuickPhoto(false)}
                  >
                    Schließen
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Wähle einen Stopp aus, um direkt ein Foto aufzunehmen/hochzuladen.
                </p>
                <div className="divide-y">
                  {stopps.map((s) => {
                    const count = (fotosMap[s.id] || []).length;
                    const disabled = count >= 3 || !!fotoBusy[s.id];
                    return (
                      <button
                        key={s.id}
                        className={`w-full text-left py-3 ${disabled ? "opacity-50" : "hover:bg-gray-50"} px-1`}
                        onClick={() => !disabled && triggerQuickPhoto(s.id)}
                        disabled={disabled}
                      >
                        <div className="font-medium">{s.kunde}</div>
                        <div className="text-xs text-gray-500 break-words">{s.adresse}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Fotos: {(fotosMap[s.id] || []).length}/3
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Anrufen: Liste aller Stopps mit Telefonnummer */}
          {showCallSheet && (
            <div className="md:hidden fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowCallSheet(false)}
              />
              <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-auto shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-[#0058A3]">Nummern anrufen</h3>
                  <button
                    className="text-sm bg-gray-200 px-3 py-1 rounded"
                    onClick={() => setShowCallSheet(false)}
                  >
                    Schließen
                  </button>
                </div>
                {stoppsMitTelefon.length === 0 ? (
                  <div className="text-sm text-gray-600">Keine Telefonnummern vorhanden.</div>
                ) : (
                  <div className="space-y-2">
                    {stoppsMitTelefon.map((s) => (
                      <a
                        key={s.id}
                        href={telHref(s.telefon)}
                        className="flex items-start justify-between gap-3 border rounded-lg p-3 hover:bg-gray-50"
                        onClick={() => setShowCallSheet(false)}
                      >
                        <div>
                          <div className="font-medium">{s.kunde}</div>
                          <div className="text-xs text-gray-500 break-words">{s.adresse}</div>
                        </div>
                        <div className="text-[#0058A3] text-sm font-medium">{s.telefon}</div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
