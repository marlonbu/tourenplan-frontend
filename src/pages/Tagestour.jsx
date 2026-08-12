// src/pages/Tagestour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  ClipboardList,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Save,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";

// PDF / QR
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

// ---------- Fester Startpunkt (Firma) ----------
const START_ADRESSE = "Hans Gehlenborg GmbH, Fehnstraße 3, 49699 Lindern";
// Fixe Koordinaten (lat, lng)
const FIRMA_COORDS = [52.8413511, 7.7705647];
const GMAPS_ORIGIN = `${FIRMA_COORDS[0]},${FIRMA_COORDS[1]}`;

const LAST_DRIVER_KEY = "tourenplan:last-driver";
const ACTIVE_STOP_KEY_PREFIX = "tourenplan:active-stop:";

// ---------- Icons für Leaflet ----------
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

// Wenn die mobile Karte aufgeklappt wird, muss Leaflet seine Größe neu berechnen.
function InvalidateMapSize({ trigger }) {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [map, trigger]);

  return null;
}

// ---------- Allgemeine Hilfsfunktionen ----------
async function fetchExternalWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function geocodeAdresse(addr) {
  if (!addr) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    addr
  )}`;
  const res = await fetchExternalWithTimeout(url, 15000);

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

// Robust gegen "YYYY-MM-DD" und komplette ISO-Strings, ohne Zeitzonenverschiebung.
function fmtDE(input) {
  const datePart = String(input || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  try {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? input || "–" : date.toLocaleDateString("de-DE");
  } catch {
    return input || "–";
  }
}

// Lokales Datum im Format YYYY-MM-DD. Im Gegensatz zu toISOString() bleibt
// der Kalendertag auch kurz nach Mitternacht in der deutschen Zeitzone korrekt.
function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function datePartISO(input) {
  const datePart = String(input || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
}

function dateFromISO(input) {
  const datePart = datePartISO(input);
  if (!datePart) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeTourDay(input) {
  const tourDate = dateFromISO(input);
  if (!tourDate) return "Geplante Tour";

  const today = dateFromISO(localDateISO());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (localDateISO(tourDate) === localDateISO(today)) return "Heute";
  if (localDateISO(tourDate) === localDateISO(tomorrow)) return "Morgen";

  return tourDate.toLocaleDateString("de-DE", { weekday: "long" });
}

function sortUpcomingTouren(rows) {
  return [...rows].sort((a, b) => {
    const dateA = datePartISO(a?.datum);
    const dateB = datePartISO(b?.datum);

    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const driverComparison = String(a?.fahrer_name || "").localeCompare(
      String(b?.fahrer_name || ""),
      "de",
      { sensitivity: "base" }
    );

    if (driverComparison !== 0) return driverComparison;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

// Robust gegen "YYYY-MM-DD" und komplette ISO-Strings
function kwFromDateISO(input) {
  try {
    const d0 = new Date(input);
    if (Number.isNaN(d0.getTime())) return null;

    // ISO-Woche nach DIN: Montag = Wochenanfang
    const d = new Date(
      Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate())
    );
    const dayNum = (d.getUTCDay() + 6) % 7; // Mo=0..So=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // auf Donnerstag der Woche

    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstThuDay = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - firstThuDay + 3);

    const week = 1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
    const year = d.getUTCFullYear();
    return { week, year };
  } catch {
    return null;
  }
}

function getErrorMessage(error, fallbackMessage) {
  if (error?.code === "NETWORK_ERROR") {
    return "Der Server ist momentan nicht erreichbar. Bitte prüfen Sie die Internetverbindung und versuchen Sie es erneut.";
  }

  if (error?.code === "TIMEOUT") {
    return "Der Server hat zu lange nicht geantwortet. Bitte versuchen Sie es erneut.";
  }

  if (error?.code === "SESSION_EXPIRED") {
    return "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";
  }

  return error?.message || fallbackMessage;
}

function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    if (value === null || value === undefined || value === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
  } catch {
    // Lokaler Speicher ist nur eine Komfortfunktion. Fehler blockieren die App nicht.
  }
}

/**
 * Google-Maps URL:
 * origin      = Firma (Koordinaten)
 * waypoints   = alle Kundenstopps in Reihenfolge
 * destination = Firma (Textadresse)
 * Route: Firma -> Stopps -> Firma (Rückweg)
 * Hinweis: Das beeinflusst NICHT die OSRM/OSM-Karte.
 */
function buildGoogleMapsRouteURL(startOrigin, stopps) {
  const addrs = (stopps || []).map((stopp) => stopp?.adresse).filter(Boolean);

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

// Navigation vom aktuellen Standort direkt zu einem einzelnen Stopp.
function buildStopNavigationURL(stopp) {
  if (!stopp?.adresse) return "";

  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(
    stopp.adresse
  )}`;
}

// OSRM-Routenabfrage (Straßenroute). Erwartet coords: [[lat, lon], ...] in Reihenfolge.
async function fetchOsrmRoute(coords) {
  if (!coords || coords.length < 2) return null;

  const path = coords.map(([lat, lon]) => `${lon},${lat}`).join(";"); // OSRM will lon,lat
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  const res = await fetchExternalWithTimeout(url, 20000);

  if (!res.ok) return null;

  const data = await res.json();
  const line =
    data?.routes?.[0]?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]) ||
    [];

  return line.length ? line : null;
}

function StatusNotice({ message, type = "info", onClose }) {
  if (!message) return null;

  const variants = {
    success: {
      wrapper: "border-green-200 bg-green-50 text-green-800",
      icon: CheckCircle2,
    },
    error: {
      wrapper: "border-red-200 bg-red-50 text-red-800",
      icon: AlertCircle,
    },
    info: {
      wrapper: "border-blue-200 bg-blue-50 text-blue-800",
      icon: Info,
    },
  };

  const variant = variants[type] || variants.info;
  const Icon = variant.icon;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${variant.wrapper}`}
      role={type === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm leading-5">{message}</div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition hover:bg-black/5 hover:opacity-100"
            aria-label="Hinweis schließen"
            title="Hinweis schließen"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SaveIndicator({ state }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-gray-600">
        <Loader2 className="animate-spin" size={14} aria-hidden="true" />
        Wird gespeichert…
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-green-700">
        <CheckCircle2 size={14} aria-hidden="true" />
        Gespeichert
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <AlertCircle size={14} aria-hidden="true" />
        Speichern fehlgeschlagen
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <Save size={14} aria-hidden="true" />
      Speichert automatisch
    </span>
  );
}

function PhotoGallery({ fotos, busy, onAdd, onDelete, label, compact = false }) {
  const count = fotos.length;
  const thumbnailSize = compact ? "h-14 w-14" : "h-20 w-20";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {fotos.map((foto, index) => (
          <div
            key={foto.id}
            className={`group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 ${thumbnailSize}`}
          >
            <a
              href={foto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full w-full"
              title="Foto groß öffnen"
            >
              <img
                src={foto.url}
                alt={`${label || "Stopp"} – Foto ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-1 left-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                <ExternalLink size={13} aria-hidden="true" />
              </span>
            </a>

            <button
              type="button"
              title="Foto löschen"
              aria-label={`Foto ${index + 1} löschen`}
              onClick={() => onDelete(foto.id)}
              disabled={busy}
              className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-red-700 shadow transition hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onAdd}
          disabled={count >= 3 || busy}
          className={`inline-flex ${thumbnailSize} flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#0058A3]/50 bg-[#E8F1FA]/60 text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:opacity-70`}
          title={count >= 3 ? "Maximal 3 Fotos" : "Foto aufnehmen oder auswählen"}
        >
          {busy ? (
            <Loader2 className="animate-spin" size={compact ? 18 : 22} aria-hidden="true" />
          ) : (
            <Camera size={compact ? 18 : 22} aria-hidden="true" />
          )}
          <span className="text-[10px] font-semibold leading-none">
            {busy ? "Lädt" : "Foto"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <ImageIcon size={14} aria-hidden="true" />
        <span>{count}/3 Fotos</span>
        {count >= 3 ? <span>· Maximum erreicht</span> : null}
      </div>
    </div>
  );
}

export default function Tagestour() {
  const [fahrer, setFahrer] = useState([]);
  const [fahrerLoading, setFahrerLoading] = useState(true);
  const [selectedFahrer, setSelectedFahrer] = useState("");
  const [datum, setDatum] = useState(() => localDateISO());
  const [tour, setTour] = useState(null);

  // Tourauswahl für Fahrer: alle Touren ab dem heutigen Tag.
  const [upcomingTouren, setUpcomingTouren] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState("");
  const [manualDateOpen, setManualDateOpen] = useState(false);
  const [openingTourId, setOpeningTourId] = useState(null);

  const [stopps, setStopps] = useState([]); // rohe Stopps aus API
  const [startCoord, setStartCoord] = useState(null); // Koordinate Firma
  const [geoStopps, setGeoStopps] = useState([]); // [{ stopp, coord|null }]
  const [markerCoords, setMarkerCoords] = useState([]); // Start + vorhandene Stopp-Koordinaten
  const [routeCoords, setRouteCoords] = useState([]); // OSRM-Linie

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Autosave-Status für "Anmerkung Fahrer"
  const [saveState, setSaveState] = useState({}); // { [id]: "saving"|"saved"|"error"|"idle" }
  const timersRef = useRef({}); // Debounce Timer je Stopp-ID

  // Fotos pro Stopp
  const [fotosMap, setFotosMap] = useState({});
  const [fotoBusy, setFotoBusy] = useState({});
  const fileInputRefs = useRef({});

  // Mobile Fahreransicht
  const [showTourPicker, setShowTourPicker] = useState(true);
  const [activeStoppId, setActiveStoppId] = useState(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [showQuickPhoto, setShowQuickPhoto] = useState(false);
  const [showCallSheet, setShowCallSheet] = useState(false);

  const currentStopSectionRef = useRef(null);
  const loadRequestRef = useRef(0);
  const upcomingRequestRef = useRef(0);

  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  const selectedDriver = useMemo(
    () =>
      fahrer.find((entry) => String(entry.id) === String(selectedFahrer)) || null,
    [fahrer, selectedFahrer]
  );

  const selectedDriverName =
    selectedDriver?.name ||
    tour?.fahrer_name ||
    fahrer.find((entry) => String(entry.id) === String(tour?.fahrer_id))?.name ||
    (selectedFahrer ? "Fahrer nicht gefunden" : "Alle Fahrer");

  const activeStopIndex = useMemo(() => {
    if (stopps.length === 0) return -1;

    const index = stopps.findIndex(
      (stopp) => String(stopp.id) === String(activeStoppId)
    );

    return index >= 0 ? index : 0;
  }, [stopps, activeStoppId]);

  const activeStopp = activeStopIndex >= 0 ? stopps[activeStopIndex] : null;
  const activeFotos = activeStopp ? fotosMap[activeStopp.id] || [] : [];
  const activeFotoBusy = activeStopp ? !!fotoBusy[activeStopp.id] : false;
  const activeStopNavigationUrl = buildStopNavigationURL(activeStopp);
  const stoppsMitTelefon = stopps.filter((stopp) => !!stopp.telefon);
  const gmapsUrl = buildGoogleMapsRouteURL(GMAPS_ORIGIN, stopps);
  const shouldRenderMap = isDesktopViewport || mobileMapOpen;
  const missingGeoCount = geoStopps.filter(
    (entry) => entry.stopp?.adresse && !entry.coord
  ).length;

  useEffect(() => {
    ladeFahrer();
  }, []);

  useEffect(() => {
    void ladeKommendeTouren(selectedFahrer);
  }, [selectedFahrer]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event) => setIsDesktopViewport(event.matches);

    setIsDesktopViewport(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!showQuickPhoto && !showCallSheet) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowQuickPhoto(false);
        setShowCallSheet(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showQuickPhoto, showCallSheet]);

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1;
      upcomingRequestRef.current += 1;

      Object.values(timersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  useEffect(() => {
    if (stopps.length === 0) {
      setActiveStoppId(null);
      return;
    }

    const activeExists = stopps.some(
      (stopp) => String(stopp.id) === String(activeStoppId)
    );

    if (!activeExists) {
      setActiveStoppId(stopps[0].id);
    }
  }, [stopps, activeStoppId]);

  async function ladeFahrer() {
    try {
      setFahrerLoading(true);
      const data = await api.listFahrer();
      const list = Array.isArray(data) ? data : [];
      setFahrer(list);

      setSelectedFahrer((current) => {
        if (current) return current;

        const storedDriver = getStoredValue(LAST_DRIVER_KEY);
        const storedDriverExists = list.some(
          (entry) => String(entry.id) === String(storedDriver)
        );

        return storedDriverExists ? storedDriver : "";
      });
    } catch (error) {
      console.error("Fehler beim Laden der Fahrer:", error);
      setMsgType("error");
      setMsg(getErrorMessage(error, "Die Fahrer konnten nicht geladen werden."));
    } finally {
      setFahrerLoading(false);
    }
  }

  async function ladeKommendeTouren(fahrerId = selectedFahrer) {
    const requestId = upcomingRequestRef.current + 1;
    upcomingRequestRef.current = requestId;
    const today = localDateISO();

    try {
      setUpcomingLoading(true);
      setUpcomingError("");

      const data = await api.getTourenAdmin({
        fahrer_id: fahrerId || undefined,
        date_from: today,
      });

      if (upcomingRequestRef.current !== requestId) return;

      const rows = (Array.isArray(data) ? data : []).filter((entry) => {
        const entryDate = datePartISO(entry?.datum);
        return entryDate && entryDate >= today;
      });

      setUpcomingTouren(sortUpcomingTouren(rows));
    } catch (error) {
      if (upcomingRequestRef.current !== requestId) return;

      console.error("Kommende Touren konnten nicht geladen werden:", error);
      setUpcomingTouren([]);
      setUpcomingError(
        getErrorMessage(error, "Die kommenden Touren konnten nicht geladen werden.")
      );
    } finally {
      if (upcomingRequestRef.current === requestId) {
        setUpcomingLoading(false);
      }
    }
  }

  function clearTourData() {
    setTour(null);
    setStopps([]);
    setSaveState({});
    setRouteCoords([]);
    setMarkerCoords([]);
    setGeoStopps([]);
    setStartCoord(null);
    setFotosMap({});
    setFotoBusy({});
    setActiveStoppId(null);
    setMobileMapOpen(false);
    setMapLoading(false);
    setShowQuickPhoto(false);
    setShowCallSheet(false);
  }

  function resetLoadedTour({ clearMessage = true } = {}) {
    loadRequestRef.current += 1;
    clearTourData();

    if (clearMessage) {
      setMsg("");
      setMsgType("info");
    }
  }

  function handleFahrerChange(event) {
    const nextFahrer = event.target.value;

    // Eine noch laufende Anfrage des vorherigen Fahrers darf die neue Liste
    // nicht mehr überschreiben.
    upcomingRequestRef.current += 1;

    setSelectedFahrer(nextFahrer);
    setStoredValue(LAST_DRIVER_KEY, nextFahrer);
    setDatum(localDateISO());
    setUpcomingTouren([]);
    setUpcomingError("");
    setUpcomingLoading(true);
    setManualDateOpen(false);
    setOpeningTourId(null);
    resetLoadedTour();
    setShowTourPicker(true);
  }

  function handleDatumChange(event) {
    setDatum(event.target.value);
    setMsg("");
    setMsgType("info");
  }

  function restoreActiveStop(loadedTour, loadedStopps) {
    if (!loadedTour?.id || loadedStopps.length === 0) {
      setActiveStoppId(null);
      return;
    }

    const storageKey = `${ACTIVE_STOP_KEY_PREFIX}${loadedTour.id}`;
    const storedStopId = getStoredValue(storageKey);
    const storedStopExists = loadedStopps.some(
      (stopp) => String(stopp.id) === String(storedStopId)
    );
    const nextActiveId = storedStopExists ? storedStopId : loadedStopps[0].id;

    setActiveStoppId(nextActiveId);
    setStoredValue(storageKey, nextActiveId);
  }

  function selectActiveStopp(stoppId, { scrollToTop = false } = {}) {
    setActiveStoppId(stoppId);

    if (tour?.id) {
      setStoredValue(`${ACTIVE_STOP_KEY_PREFIX}${tour.id}`, stoppId);
    }

    if (scrollToTop) {
      window.setTimeout(() => {
        currentStopSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 40);
    }
  }

  function selectPreviousStop() {
    if (activeStopIndex <= 0) return;
    selectActiveStopp(stopps[activeStopIndex - 1].id, { scrollToTop: true });
  }

  function selectNextStop() {
    if (activeStopIndex < 0 || activeStopIndex >= stopps.length - 1) return;
    selectActiveStopp(stopps[activeStopIndex + 1].id, { scrollToTop: true });
  }

  function openUpcomingTour(tourSummary) {
    const selectedDate = datePartISO(tourSummary?.datum);
    const tourDriverId = String(tourSummary?.fahrer_id || "");

    if (!selectedDate || !tourSummary?.id || !tourDriverId) {
      setMsgType("error");
      setMsg("Diese Tour konnte nicht eindeutig gelesen werden.");
      return;
    }

    setSelectedFahrer(tourDriverId);
    setStoredValue(LAST_DRIVER_KEY, tourDriverId);
    setDatum(selectedDate);
    void ladeTourFuerDatum(selectedDate, tourSummary, tourDriverId);
  }

  async function ladeTour() {
    await ladeTourFuerDatum(datum);
  }

  async function ladeTourFuerDatum(
    targetDatum,
    sourceTour = null,
    fahrerId = selectedFahrer
  ) {
    const normalizedDatum = datePartISO(targetDatum);
    const normalizedFahrerId = String(fahrerId || sourceTour?.fahrer_id || "");
    const sourceTourId = sourceTour?.id || null;
    const driverName =
      sourceTour?.fahrer_name ||
      fahrer.find((entry) => String(entry.id) === normalizedFahrerId)?.name ||
      selectedDriver?.name ||
      "diesen Fahrer";

    if (!normalizedFahrerId || !normalizedDatum) {
      setMsgType("info");
      setMsg("Bitte wählen Sie zuerst einen Fahrer und ein Datum aus.");
      setShowTourPicker(true);
      return;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    setLoading(true);
    setOpeningTourId(sourceTourId);
    setMapLoading(false);
    setMsg("");
    setMsgType("info");
    clearTourData();

    try {
      let data;

      if (sourceTourId) {
        const loadedStopps = await api.getStoppsByTour(sourceTourId);
        data = {
          tour: sourceTour,
          stopps: Array.isArray(loadedStopps) ? loadedStopps : [],
        };
      } else {
        data = await api.getTour(normalizedFahrerId, normalizedDatum);
      }

      if (loadRequestRef.current !== requestId) return;

      const loadedTour = data?.tour || null;
      const loadedStopps = Array.isArray(data?.stopps) ? data.stopps : [];

      if (!loadedTour) {
        setMsgType("info");
        setMsg(
          `Für ${driverName} am ${fmtDE(
            normalizedDatum
          )} wurde keine Tour gefunden.`
        );
        setShowTourPicker(true);
        return;
      }

      setSelectedFahrer(normalizedFahrerId);
      setTour(loadedTour);
      setStopps(loadedStopps);
      setStartCoord(FIRMA_COORDS);
      setShowTourPicker(false);
      setManualDateOpen(false);
      restoreActiveStop(loadedTour, loadedStopps);
      setStoredValue(LAST_DRIVER_KEY, normalizedFahrerId);
      setMsgType("success");
      setMsg(
        `Die Tour für ${driverName} am ${fmtDE(
          loadedTour.datum || normalizedDatum
        )} wurde geladen.`
      );

      // Die eigentlichen Tourdaten stehen sofort zur Verfügung. Karte und Fotos
      // werden anschließend vorbereitet, damit die Fahreransicht schneller nutzbar ist.
      setLoading(false);

      void (async () => {
        for (const stopp of loadedStopps) {
          if (loadRequestRef.current !== requestId) return;
          await ladeFotos(stopp.id, requestId);
        }
      })();

      setMapLoading(true);

      try {
        // 1) Stopps nacheinander geokodieren.
        const geos = [];
        for (const stopp of loadedStopps) {
          if (loadRequestRef.current !== requestId) return;

          if (!stopp?.adresse) {
            geos.push({ stopp, coord: null });
            continue;
          }

          try {
            const coord = await geocodeAdresse(stopp.adresse);
            geos.push({ stopp, coord });
          } catch {
            geos.push({ stopp, coord: null });
          }
        }

        if (loadRequestRef.current !== requestId) return;

        setGeoStopps(geos);

        // 2) Marker setzen.
        const nextMarkerCoords = [
          FIRMA_COORDS,
          ...geos.filter((entry) => !!entry.coord).map((entry) => entry.coord),
        ];
        setMarkerCoords(nextMarkerCoords);

        // 3) Route (OSRM) – KEIN Rückweg zur Firma, nur die OSM-Anzeige.
        const routeInput = [
          FIRMA_COORDS,
          ...geos.map((entry) => entry.coord).filter(Boolean),
        ].filter(Boolean);

        if (routeInput.length >= 2) {
          try {
            const line = await fetchOsrmRoute(routeInput);

            if (loadRequestRef.current !== requestId) return;

            setRouteCoords(line && line.length ? line : routeInput);
          } catch (routeError) {
            console.error("OSM-Route konnte nicht geladen werden:", routeError);

            if (loadRequestRef.current !== requestId) return;

            // Die Stoppdaten bleiben vollständig nutzbar. Als Karten-Fallback
            // werden die vorhandenen Punkte direkt miteinander verbunden.
            setRouteCoords(routeInput);
          }
        } else {
          setRouteCoords([]);
        }
      } catch (mapError) {
        console.error("Karte konnte nicht vollständig vorbereitet werden:", mapError);

        if (loadRequestRef.current === requestId) {
          setRouteCoords([]);
          setMarkerCoords([FIRMA_COORDS]);
          setMsgType("info");
          setMsg(
            "Die Tour wurde geladen. Die Karte konnte momentan nicht vollständig vorbereitet werden; Stopps, Navigation, Fotos und Anmerkungen bleiben nutzbar."
          );
        }
      } finally {
        if (loadRequestRef.current === requestId) {
          setMapLoading(false);
        }
      }
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;

      console.error("Fehler beim Laden der Tour:", error);
      clearTourData();
      setShowTourPicker(true);
      setMsgType("error");
      setMsg(getErrorMessage(error, "Die Tour konnte nicht geladen werden."));
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false);
        setOpeningTourId(null);
      }
    }
  }

  function openTourPicker() {
    setShowTourPicker(true);
    void ladeKommendeTouren(selectedFahrer);
  }

  // ---- Fotos laden/aktualisieren ----
  async function ladeFotos(stoppId, requestId = null) {
    try {
      setFotoBusy((current) => ({ ...current, [stoppId]: true }));
      const arr = await api.getStoppFotos(stoppId);

      if (requestId !== null && loadRequestRef.current !== requestId) return;

      setFotosMap((current) => ({
        ...current,
        [stoppId]: Array.isArray(arr) ? arr : [],
      }));
    } catch (error) {
      console.error("Fotos laden fehlgeschlagen:", error);
    } finally {
      if (requestId === null || loadRequestRef.current === requestId) {
        setFotoBusy((current) => ({ ...current, [stoppId]: false }));
      }
    }
  }

  async function uploadFoto(stoppId, fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    try {
      setFotoBusy((current) => ({ ...current, [stoppId]: true }));
      await api.uploadStoppFoto(stoppId, file);
      fileInput.value = "";
      await ladeFotos(stoppId);
    } catch (error) {
      console.error("Foto-Upload fehlgeschlagen:", error);
      window.alert(
        getErrorMessage(error, "Das Foto konnte nicht hochgeladen werden.")
      );
    } finally {
      if (fileInput) fileInput.value = "";
      setFotoBusy((current) => ({ ...current, [stoppId]: false }));
    }
  }

  async function deleteFoto(fotoId, stoppId) {
    const confirmed = window.confirm("Foto wirklich löschen?");
    if (!confirmed) return;

    try {
      setFotoBusy((current) => ({ ...current, [stoppId]: true }));
      await api.deleteStoppFoto(fotoId);
      setFotosMap((current) => ({
        ...current,
        [stoppId]: (current[stoppId] || []).filter((foto) => foto.id !== fotoId),
      }));
      await ladeFotos(stoppId);
    } catch (error) {
      console.error("Foto löschen fehlgeschlagen:", error);
      window.alert(
        getErrorMessage(error, "Das Foto konnte nicht gelöscht werden.")
      );
    } finally {
      setFotoBusy((current) => ({ ...current, [stoppId]: false }));
    }
  }

  function triggerQuickPhoto(stoppId) {
    const count = (fotosMap[stoppId] || []).length;

    if (count >= 3) {
      setMsgType("info");
      setMsg("Für diesen Stopp sind bereits drei Fotos gespeichert.");
      setShowQuickPhoto(false);
      return;
    }

    if (fotoBusy[stoppId]) return;

    const input =
      document.getElementById(`foto-input-${stoppId}`) ||
      fileInputRefs.current[stoppId];

    if (input) input.click();
    setShowQuickPhoto(false);
  }

  // Eingabe-Handler für "Anmerkung Fahrer" (Autosave)
  function handleAnmerkungChange(id, value) {
    setStopps((currentStopps) =>
      currentStopps.map((stopp) =>
        stopp.id === id ? { ...stopp, anmerkung_fahrer: value } : stopp
      )
    );

    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
    }

    setSaveState((current) => ({ ...current, [id]: "saving" }));

    timersRef.current[id] = window.setTimeout(() => {
      delete timersRef.current[id];
      void saveAnmerkung(id, value);
    }, 1000);
  }

  function handleAnmerkungBlur(id, value) {
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }

    void saveAnmerkung(id, value);
  }

  async function saveAnmerkung(id, value) {
    try {
      await api.updateStoppAnmerkung(id, value);
      setSaveState((current) => ({ ...current, [id]: "saved" }));

      window.setTimeout(() => {
        setSaveState((current) => ({ ...current, [id]: "idle" }));
      }, 1500);
    } catch (error) {
      console.error("Anmerkung speichern fehlgeschlagen:", error);
      setSaveState((current) => ({ ...current, [id]: "error" }));
    }
  }

  // PDF-Export der vollständigen Tagestour
  async function handleExportPdf() {
    if (!tour || pdfBusy) {
      if (!tour) window.alert("Bitte zuerst eine Tour laden.");
      return;
    }

    try {
      setPdfBusy(true);

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
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
      const qrDataUrl = await QRCode.toDataURL(gmapsUrl, { margin: 1, width: 130 });
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

      // Meta unter dem Banner (einheitlicher Zeilenabstand) – dynamische Spalten
      const metaStartY = bannerH + 18;
      const metaLine = 20;
      const fahrerName = selectedDriverName || "—";
      const kwObj = kwFromDateISO(tour.datum);
      const kwText = kwObj ? `KW ${String(kwObj.week).padStart(2, "0")}` : "—";
      const bemerkung = tour.bemerkung || "—";

      // Labels & dynamischer Wert-X anhand längstem Label
      const labels = ["Datum:", "Fahrer:", "Kalenderwoche:", "Bemerkung:"];
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const labelX = 46;
      const labelWidths = labels.map((text) => doc.getTextWidth(text));
      const maxLabelW = Math.max(...labelWidths);
      const valueX = labelX + maxLabelW + 14;

      labels.forEach((text, index) =>
        doc.text(text, labelX, metaStartY + metaLine * index)
      );

      doc.setFont("helvetica", "normal");
      doc.text(fmtDE(tour.datum), valueX, metaStartY);
      doc.text(fahrerName, valueX, metaStartY + metaLine);
      doc.text(kwText, valueX, metaStartY + metaLine * 2);

      // Bemerkung ggf. umbrochen
      const bemY = metaStartY + metaLine * 3;
      const bemMaxW = pageWidth - valueX - 46;
      const bemWrapped = doc.splitTextToSize(bemerkung, Math.max(120, bemMaxW));
      doc.text(bemWrapped, valueX, bemY);

      // Tabelle direkt darunter starten
      const tableStartY =
        bemY + (bemWrapped.length > 1 ? 16 + (bemWrapped.length - 1) * 14 : 16);

      const head = [
        ["Pos", "Ankunft", "Kunde", "Adresse", "Telefon", "Kommission", "Hinweis"],
      ];
      const body = (stopps || []).map((stopp, index) => [
        Number.isFinite(stopp.position) ? String(stopp.position) : String(index + 1),
        stopp.ankunft || "",
        stopp.kunde || "",
        stopp.adresse || "",
        stopp.telefon || "",
        stopp.kommission || "",
        stopp.hinweis || "",
      ]);

      // Spaltenbreiten (A4 quer, Ränder 40 pt)
      const margin = { left: 40, right: 40, top: 40, bottom: 40 };
      const colWidths = {
        0: 35,
        1: 70,
        2: 110,
        3: 210,
        4: 95,
        5: 110,
        6: 110,
      };

      autoTable(doc, {
        head,
        body,
        startY: Math.max(tableStartY, bannerH + 8),
        margin,
        tableWidth: "auto",
        styles: {
          font: "helvetica",
          fontSize: 11,
          cellPadding: 6,
          valign: "top",
          overflow: "linebreak",
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
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: colWidths[0], halign: "center" },
          1: { cellWidth: colWidths[1] },
          2: { cellWidth: colWidths[2] },
          3: { cellWidth: colWidths[3] },
          4: { cellWidth: colWidths[4] },
          5: { cellWidth: colWidths[5] },
          6: { cellWidth: colWidths[6] },
        },
        theme: "grid",
        didDrawPage: () => {
          const timestamp = new Date().toLocaleString("de-DE");
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text(`Erstellt am ${timestamp}`, 46, pageHeight - 18);
        },
      });

      doc.save(
        `Tagestour_${fmtDE(tour.datum)}_${fahrerName.replace(/\s+/g, "_")}.pdf`
      );
    } catch (error) {
      console.error("PDF-Erstellung fehlgeschlagen:", error);
      window.alert("Das PDF konnte nicht erstellt werden.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-32 md:space-y-6 lg:pb-6">
      <h1 className="text-2xl font-semibold text-[#0058A3] md:text-3xl">
        Tagestour
      </h1>

      <StatusNotice
        message={msg}
        type={msgType}
        onClose={() => setMsg("")}
      />

      {/* Tourauswahl: Ohne Fahrerauswahl werden alle Touren ab heute angezeigt. */}
      {showTourPicker || !tour ? (
        <section className="space-y-5 bg-white p-4 shadow sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FA] text-[#0058A3]">
                  <Truck size={21} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-[#0058A3]">Tour öffnen</h2>
                  <p className="mt-0.5 text-sm text-gray-600">
                    Alle Fahrer anzeigen oder einen Namen auswählen. Danach kann die gewünschte Tour direkt geöffnet werden.
                  </p>
                </div>
              </div>
            </div>

            {tour ? (
              <button
                type="button"
                onClick={() => setShowTourPicker(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-200 sm:w-auto"
              >
                <X size={17} aria-hidden="true" />
                Auswahl schließen
              </button>
            ) : null}
          </div>

          <div className="max-w-2xl">
            <label
              htmlFor="tagestour-fahrer"
              className="mb-1.5 block text-sm font-semibold text-gray-700"
            >
              Fahrer
            </label>
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
                aria-hidden="true"
              />
              <select
                id="tagestour-fahrer"
                className="w-full pl-10"
                value={selectedFahrer}
                onChange={handleFahrerChange}
                disabled={fahrerLoading || loading}
              >
                <option value="">
                  {fahrerLoading ? "Alle Fahrer – Namen werden geladen…" : "Alle Fahrer"}
                </option>
                {fahrer.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-200 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0058A3]">
                    <CalendarDays size={20} aria-hidden="true" />
                    {selectedFahrer
                      ? `Kommende Touren für ${selectedDriverName}`
                      : "Alle kommenden Touren"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {selectedFahrer
                      ? "Angezeigt werden alle Touren dieses Fahrers ab heute. Die nächste Tour steht oben."
                      : "Angezeigt werden alle Touren aller Fahrer ab heute. Die nächste Tour steht oben."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => ladeKommendeTouren(selectedFahrer)}
                  disabled={upcomingLoading || loading}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-200 disabled:opacity-60 sm:w-auto"
                >
                  <RefreshCw
                    className={upcomingLoading ? "animate-spin" : ""}
                    size={17}
                    aria-hidden="true"
                  />
                  Aktualisieren
                </button>
            </div>

            {upcomingLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="min-h-[150px] animate-pulse rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="h-4 w-20 rounded bg-gray-200" />
                      <div className="mt-3 h-7 w-36 rounded bg-gray-200" />
                      <div className="mt-4 h-4 w-full rounded bg-gray-200" />
                      <div className="mt-2 h-4 w-2/3 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : upcomingError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-5">{upcomingError}</div>
                      <button
                        type="button"
                        onClick={() => ladeKommendeTouren(selectedFahrer)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-200 transition hover:bg-red-100"
                      >
                        <RefreshCw size={16} aria-hidden="true" />
                        Erneut versuchen
                      </button>
                    </div>
                  </div>
                </div>
              ) : upcomingTouren.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
                  <CalendarDays className="mx-auto text-gray-400" size={32} aria-hidden="true" />
                  <div className="mt-3 font-semibold text-gray-800">
                    Keine kommenden Touren vorhanden
                  </div>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    {selectedFahrer
                      ? `Für ${selectedDriverName} ist ab heute aktuell keine Tour geplant.`
                      : "Ab heute sind aktuell keine Touren geplant."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {upcomingTouren.map((entry) => {
                    const entryDate = datePartISO(entry.datum);
                    const dayLabel = relativeTourDay(entry.datum);
                    const isToday = entryDate === localDateISO();
                    const isOpen = String(tour?.id) === String(entry.id);
                    const isOpening =
                      loading && String(openingTourId) === String(entry.id);
                    const stopCount = Number(entry.stopps_count || 0);

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          if (isOpen) {
                            setShowTourPicker(false);
                          } else {
                            openUpcomingTour(entry);
                          }
                        }}
                        disabled={loading}
                        className={`group flex min-h-[178px] w-full flex-col rounded-2xl border p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058A3]/40 disabled:cursor-wait disabled:opacity-70 ${
                          isOpen
                            ? "border-green-300 bg-green-50"
                            : isToday
                            ? "border-[#0058A3] bg-[#E8F1FA]/55 hover:bg-[#E8F1FA]"
                            : "border-gray-200 bg-white hover:border-[#0058A3]/50 hover:bg-blue-50/40 hover:shadow-md"
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isOpen
                                  ? "bg-green-100 text-green-800"
                                  : isToday
                                  ? "bg-[#0058A3] text-white"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {isOpen ? "Geöffnet" : dayLabel}
                            </span>
                            <span className="mt-2 block text-xl font-bold text-gray-900">
                              {fmtDE(entry.datum)}
                            </span>
                          </span>

                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                              isOpen
                                ? "bg-green-600 text-white"
                                : "bg-[#E8F1FA] text-[#0058A3] group-hover:bg-[#0058A3] group-hover:text-white"
                            }`}
                          >
                            {isOpening ? (
                              <Loader2 className="animate-spin" size={20} aria-hidden="true" />
                            ) : isOpen ? (
                              <CheckCircle2 size={20} aria-hidden="true" />
                            ) : (
                              <ArrowRight size={20} aria-hidden="true" />
                            )}
                          </span>
                        </span>

                        {!selectedFahrer ? (
                          <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#0058A3]">
                            <UserRound size={16} aria-hidden="true" />
                            {entry.fahrer_name || "Ohne Fahrer"}
                          </span>
                        ) : null}

                        <span className={`${selectedFahrer ? "mt-4" : "mt-3"} flex flex-wrap items-center gap-2 text-sm text-gray-700`}>
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <ClipboardList size={16} className="text-[#0058A3]" aria-hidden="true" />
                            {stopCount} {stopCount === 1 ? "Stopp" : "Stopps"}
                          </span>
                          {entry.kunden_preview ? (
                            <span className="text-gray-400" aria-hidden="true">•</span>
                          ) : null}
                          {entry.kunden_preview ? (
                            <span className="min-w-0 break-words text-gray-600">
                              {entry.kunden_preview}
                            </span>
                          ) : null}
                        </span>

                        {entry.bemerkung ? (
                          <span className="mt-3 line-clamp-2 break-words text-xs leading-5 text-gray-500">
                            {entry.bemerkung}
                          </span>
                        ) : null}

                        <span className="mt-auto pt-4 text-sm font-semibold text-[#0058A3]">
                          {isOpening
                            ? "Tour wird geladen…"
                            : isOpen
                            ? "Zur geöffneten Tour"
                            : "Tour öffnen"}
                        </span>
                      </button>
                    );
                  })}
                </div>
            )}
          </div>

          {selectedFahrer ? (
            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setManualDateOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
                aria-expanded={manualDateOpen}
              >
                <span className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-[#0058A3]" aria-hidden="true" />
                  Tour über ein bestimmtes Datum suchen
                </span>
                <ChevronDown
                  className={`shrink-0 transition ${manualDateOpen ? "rotate-180" : ""}`}
                  size={18}
                  aria-hidden="true"
                />
              </button>

              {manualDateOpen ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-3 text-sm leading-5 text-gray-600">
                    Nur nötig, wenn eine vergangene Tour oder ein ganz bestimmter Tag geöffnet werden soll.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-[minmax(190px,280px)_auto] sm:items-end">
                    <div>
                      <label
                        htmlFor="tagestour-datum"
                        className="mb-1.5 block text-sm font-semibold text-gray-700"
                      >
                        Datum
                      </label>
                      <div className="relative">
                        <CalendarDays
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={18}
                          aria-hidden="true"
                        />
                        <input
                          id="tagestour-datum"
                          type="date"
                          className="w-full pl-10"
                          value={datum}
                          onChange={handleDatumChange}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={ladeTour}
                      disabled={loading || !datum}
                      className="inline-flex w-full min-w-[180px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-5 py-3 font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60 sm:w-auto"
                    >
                      {loading && openingTourId === null ? (
                        <Loader2 className="animate-spin" size={19} aria-hidden="true" />
                      ) : (
                        <RefreshCw size={19} aria-hidden="true" />
                      )}
                      {loading && openingTourId === null
                        ? "Tour wird geladen…"
                        : "Datum laden"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm leading-5 text-blue-800">
            <Info className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            {selectedFahrer
              ? "Der ausgewählte Fahrer wird auf diesem Gerät für den nächsten Start vorgemerkt. Über die Auswahl kann jederzeit wieder ‚Alle Fahrer‘ angezeigt werden."
              : "Aktuell werden alle Fahrer angezeigt. Beim Öffnen einer Tour wird der zugehörige Fahrer auf diesem Gerät für den nächsten Start vorgemerkt."}
          </div>
        </section>
      ) : null}

      {/* Kompakte Tourübersicht */}
      {tour ? (
        <section className="overflow-hidden bg-white shadow">
          <div className="bg-gradient-to-r from-[#003F75] to-[#0058A3] p-4 text-white sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
                  <span>Geladene Tagestour</span>
                  <span aria-hidden="true">•</span>
                  <span>{stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}</span>
                </div>

                <div className="mt-3 flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">
                    <UserRound size={22} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xl font-bold sm:text-2xl">
                      {selectedDriverName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={16} aria-hidden="true" />
                        {fmtDE(tour.datum || datum)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Truck size={16} aria-hidden="true" />
                        Start: {START_ADRESSE}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto">
                <a
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-[#0058A3] shadow transition hover:bg-blue-50"
                >
                  <MapIcon size={19} aria-hidden="true" />
                  Tour in Google Maps
                </a>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={pdfBusy}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20 disabled:opacity-60"
                >
                  {pdfBusy ? (
                    <Loader2 className="animate-spin" size={19} aria-hidden="true" />
                  ) : (
                    <FileText size={19} aria-hidden="true" />
                  )}
                  {pdfBusy ? "PDF wird erstellt…" : "PDF erstellen"}
                </button>

                <button
                  type="button"
                  onClick={openTourPicker}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20"
                >
                  <RefreshCw size={19} aria-hidden="true" />
                  Tour wechseln
                </button>
              </div>
            </div>
          </div>

          {(tour.bemerkung || tour.id) ? (
            <details className="group border-t border-gray-200 px-4 py-3 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-700">
                <span>Weitere Tourinformationen</span>
                <ChevronDown
                  className="transition group-open:rotate-180"
                  size={18}
                  aria-hidden="true"
                />
              </summary>

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tourbemerkung
                  </div>
                  <div className="mt-1 break-words text-gray-800">
                    {tour.bemerkung || "Keine Bemerkung vorhanden"}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tour-ID
                  </div>
                  <div className="mt-1 font-semibold text-gray-800">{tour.id}</div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Gespeichertes Datum
                  </div>
                  <div className="mt-1 break-all text-gray-800">
                    {String(tour.datum || datum)}
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* Fahreransicht: der ausgewählte aktuelle Stopp steht auf dem Smartphone im Mittelpunkt. */}
      {tour && activeStopp ? (
        <section
          ref={currentStopSectionRef}
          className="scroll-mt-36 space-y-4 bg-white p-4 shadow lg:hidden"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0058A3]">
                  Aktueller Stopp
                </div>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  Stopp {activeStopIndex + 1} von {stopps.length}
                </h2>
              </div>

              {activeStopp.ankunft ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#E8F1FA] px-3 py-2 text-sm font-semibold text-[#0058A3]">
                  <Clock size={16} aria-hidden="true" />
                  {activeStopp.ankunft}
                </span>
              ) : null}
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#0058A3] transition-all"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, ((activeStopIndex + 1) / stopps.length) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0058A3] text-lg font-bold text-white">
                {activeStopp.position ?? activeStopIndex + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="break-words text-xl font-bold text-gray-900">
                  {activeStopp.kunde || "Ohne Kundenname"}
                </div>

                {activeStopp.adresse ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      activeStopp.adresse
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-start gap-2 break-words text-sm font-medium text-blue-700 hover:underline"
                  >
                    <MapPin className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                    <span>{activeStopp.adresse}</span>
                  </a>
                ) : (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <MapPin size={17} aria-hidden="true" />
                    Keine Adresse vorhanden
                  </div>
                )}

                {activeStopp.telefon ? (
                  <a
                    href={telHref(activeStopp.telefon)}
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
                  >
                    <Phone size={17} aria-hidden="true" />
                    {activeStopp.telefon}
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Package size={15} aria-hidden="true" />
                Kommission
              </div>
              <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-gray-800">
                {activeStopp.kommission || "Keine Kommission eingetragen"}
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                activeStopp.hinweis
                  ? "border-amber-200 bg-amber-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div
                className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
                  activeStopp.hinweis ? "text-amber-800" : "text-gray-500"
                }`}
              >
                <AlertCircle size={15} aria-hidden="true" />
                Hinweis
              </div>
              <div
                className={`mt-2 whitespace-pre-wrap break-words text-sm leading-5 ${
                  activeStopp.hinweis ? "font-medium text-amber-900" : "text-gray-800"
                }`}
              >
                {activeStopp.hinweis || "Kein besonderer Hinweis"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {activeStopNavigationUrl ? (
              <a
                href={activeStopNavigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-2 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-4 py-3 font-semibold text-white transition hover:bg-[#003F75]"
              >
                <Navigation size={20} aria-hidden="true" />
                Zu diesem Stopp navigieren
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="col-span-2 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gray-200 px-4 py-3 font-semibold text-gray-500"
              >
                <Navigation size={20} aria-hidden="true" />
                Keine Adresse für Navigation
              </button>
            )}

            {activeStopp.telefon ? (
              <a
                href={telHref(activeStopp.telefon)}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700 sm:col-span-1"
              >
                <Phone size={19} aria-hidden="true" />
                Anrufen
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowCallSheet(true)}
                disabled={stoppsMitTelefon.length === 0}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-200 disabled:text-gray-400"
              >
                <Phone size={19} aria-hidden="true" />
                Nummern
              </button>
            )}

            <button
              type="button"
              onClick={() => triggerQuickPhoto(activeStopp.id)}
              disabled={activeFotos.length >= 3 || activeFotoBusy}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-800 transition hover:bg-gray-200 disabled:text-gray-400"
            >
              {activeFotoBusy ? (
                <Loader2 className="animate-spin" size={19} aria-hidden="true" />
              ) : (
                <Camera size={19} aria-hidden="true" />
              )}
              Foto
            </button>

          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowQuickPhoto(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Camera size={17} aria-hidden="true" />
              Foto anderer Stopp
            </button>

            <button
              type="button"
              onClick={() => setShowCallSheet(true)}
              disabled={stoppsMitTelefon.length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:text-gray-400"
            >
              <Phone size={17} aria-hidden="true" />
              Alle Nummern
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-[#0058A3]">
                  <Camera size={18} aria-hidden="true" />
                  Fotos
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Maximal drei Fotos pro Stopp.
                </p>
              </div>
            </div>

            <PhotoGallery
              fotos={activeFotos}
              busy={activeFotoBusy}
              label={activeStopp.kunde}
              onAdd={() => triggerQuickPhoto(activeStopp.id)}
              onDelete={(fotoId) => deleteFoto(fotoId, activeStopp.id)}
            />
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label
              htmlFor={`mobile-anmerkung-${activeStopp.id}`}
              className="flex items-center gap-2 text-base font-semibold text-[#0058A3]"
            >
              <MessageSquare size={18} aria-hidden="true" />
              Fahrer-Anmerkung
            </label>
            <p className="mt-1 text-xs leading-4 text-gray-500">
              Zum Beispiel „erledigt“, „niemand angetroffen“ oder ein Problem notieren.
            </p>

            <textarea
              id={`mobile-anmerkung-${activeStopp.id}`}
              className="mt-3 min-h-[96px] w-full resize-y"
              placeholder='z. B. "Erledigt" oder Problem notieren'
              value={activeStopp.anmerkung_fahrer || ""}
              onChange={(event) =>
                handleAnmerkungChange(activeStopp.id, event.target.value)
              }
              onBlur={(event) =>
                handleAnmerkungBlur(activeStopp.id, event.target.value)
              }
            />

            <div className="mt-2 min-h-5 text-xs">
              <SaveIndicator state={saveState[activeStopp.id]} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={selectPreviousStop}
              disabled={activeStopIndex <= 0}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-3 font-semibold text-gray-800 transition hover:bg-gray-200 disabled:text-gray-400"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Vorheriger
            </button>

            <button
              type="button"
              onClick={selectNextStop}
              disabled={activeStopIndex >= stopps.length - 1}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-3 py-3 font-semibold text-white transition hover:bg-[#003F75] disabled:bg-gray-200 disabled:text-gray-400"
            >
              Nächster
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {tour && stopps.length === 0 ? (
        <section className="bg-white p-5 text-center shadow sm:p-8">
          <ClipboardList className="mx-auto text-gray-400" size={36} aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-gray-800">
            Keine Stopps vorhanden
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Für diese Tour wurden noch keine Stopps angelegt.
          </p>
        </section>
      ) : null}

      {/* Mobile Übersicht aller Stopps. Ein Tipp wählt den Stopp für die große Fahrerkarte aus. */}
      {tour && stopps.length > 0 ? (
        <section className="space-y-4 bg-white p-4 shadow lg:hidden">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#0058A3]">
              <ClipboardList size={20} aria-hidden="true" />
              Alle Stopps
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Einen Stopp antippen, um ihn oben als aktuellen Stopp anzuzeigen.
            </p>
          </div>

          <div className="space-y-2">
            {stopps.map((stopp, index) => {
              const isActive = String(stopp.id) === String(activeStopp?.id);
              const photosCount = (fotosMap[stopp.id] || []).length;
              const navigationUrl = buildStopNavigationURL(stopp);

              return (
                <article
                  key={stopp.id}
                  className={`flex items-stretch gap-2 rounded-xl border p-2 transition ${
                    isActive
                      ? "border-[#0058A3] bg-[#E8F1FA]/70 shadow-sm"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      selectActiveStopp(stopp.id, { scrollToTop: true })
                    }
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 text-left"
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                        isActive
                          ? "bg-[#0058A3] text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {stopp.position ?? index + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="break-words font-semibold text-gray-900">
                          {stopp.kunde || "Ohne Kundenname"}
                        </span>
                        {stopp.ankunft ? (
                          <span className="shrink-0 text-xs font-semibold text-[#0058A3]">
                            {stopp.ankunft}
                          </span>
                        ) : null}
                      </span>

                      <span className="mt-1 block break-words text-xs leading-4 text-gray-500">
                        {stopp.adresse || "Keine Adresse"}
                      </span>

                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {isActive ? (
                          <span className="rounded-full bg-[#0058A3] px-2 py-0.5 text-[10px] font-semibold text-white">
                            Aktuell
                          </span>
                        ) : null}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {photosCount}/3 Fotos
                        </span>
                        {stopp.telefon ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                            Telefon
                          </span>
                        ) : null}
                        {stopp.anmerkung_fahrer ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            Anmerkung
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  {navigationUrl ? (
                    <a
                      href={navigationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0058A3] shadow-sm ring-1 ring-inset ring-gray-200 transition hover:bg-blue-50"
                      aria-label={`Zu ${stopp.kunde || `Stopp ${index + 1}`} navigieren`}
                      title="Navigation öffnen"
                    >
                      <Navigation size={20} aria-hidden="true" />
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Desktop-Tabelle: alle bisherigen Felder und Funktionen bleiben vorhanden. */}
      {tour ? (
        <section className="hidden space-y-4 bg-white p-4 shadow lg:block sm:p-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#0058A3]">
                Stopps dieser Tour
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Fotos und Fahrer-Anmerkungen können direkt in der Tabelle gepflegt werden.
              </p>
            </div>

            <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">
              {stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-[1180px] w-full border-collapse text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Pos.</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Ankunft</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Kunde</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Adresse</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Telefon</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Kommission</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Hinweis</th>
                  <th className="border-r border-white/20 px-3 py-2.5 text-left">Fotos</th>
                  <th className="px-3 py-2.5 text-left">Anmerkung Fahrer</th>
                </tr>
              </thead>

              <tbody>
                {stopps.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                      Keine Stopps vorhanden
                    </td>
                  </tr>
                ) : null}

                {stopps.map((stopp, index) => {
                  const fotos = fotosMap[stopp.id] || [];
                  const busy = !!fotoBusy[stopp.id];

                  return (
                    <tr key={stopp.id || index} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="px-3 py-3 text-center font-semibold text-gray-700">
                        {stopp.position ?? index + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {stopp.ankunft || "–"}
                      </td>
                      <td className="max-w-[180px] break-words px-3 py-3 font-semibold text-gray-900">
                        {stopp.kunde || "–"}
                      </td>
                      <td className="max-w-[250px] px-3 py-3">
                        {stopp.adresse ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              stopp.adresse
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words text-blue-700 hover:underline"
                          >
                            {stopp.adresse}
                          </a>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {stopp.telefon ? (
                          <a
                            href={telHref(stopp.telefon)}
                            className="whitespace-nowrap text-blue-700 hover:underline"
                          >
                            {stopp.telefon}
                          </a>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="max-w-[210px] whitespace-pre-wrap break-words px-3 py-3">
                        {stopp.kommission || "–"}
                      </td>
                      <td className="max-w-[230px] whitespace-pre-wrap break-words px-3 py-3">
                        {stopp.hinweis || "–"}
                      </td>
                      <td className="w-[250px] px-3 py-3">
                        <PhotoGallery
                          fotos={fotos}
                          busy={busy}
                          compact
                          label={stopp.kunde}
                          onAdd={() => triggerQuickPhoto(stopp.id)}
                          onDelete={(fotoId) => deleteFoto(fotoId, stopp.id)}
                        />
                      </td>
                      <td className="w-[300px] px-3 py-3">
                        <label htmlFor={`desktop-anmerkung-${stopp.id}`} className="sr-only">
                          Fahrer-Anmerkung für {stopp.kunde || `Stopp ${index + 1}`}
                        </label>
                        <textarea
                          id={`desktop-anmerkung-${stopp.id}`}
                          className="min-h-[72px] w-full resize-y"
                          placeholder='z. B. "Erledigt" oder Problem notieren'
                          value={stopp.anmerkung_fahrer || ""}
                          onChange={(event) =>
                            handleAnmerkungChange(stopp.id, event.target.value)
                          }
                          onBlur={(event) =>
                            handleAnmerkungBlur(stopp.id, event.target.value)
                          }
                        />
                        <div className="mt-1.5 min-h-5 text-xs">
                          <SaveIndicator state={saveState[stopp.id]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Karte: mobil einklappbar, auf Desktop dauerhaft sichtbar. */}
      {tour ? (
        <section className="space-y-4 bg-white p-4 shadow sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-[#0058A3]">
                <MapIcon size={21} aria-hidden="true" />
                Karte
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Die Karte zeigt die Strecke von der Firma zu den Stopps. Die Google-Maps-Tour oben enthält zusätzlich den Rückweg zur Firma.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setMobileMapOpen((current) => !current)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-200 lg:hidden"
              aria-expanded={mobileMapOpen}
            >
              <MapIcon size={18} aria-hidden="true" />
              {mobileMapOpen ? "Karte schließen" : "Karte anzeigen"}
            </button>
          </div>

          {!mobileMapOpen ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500 lg:hidden">
              Die Karte ist auf dem Smartphone eingeklappt, damit die Stopps schneller
              erreichbar bleiben.
            </div>
          ) : null}

          {shouldRenderMap ? (
            <div>
              {mapLoading ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 text-gray-600">
                  <Loader2 className="animate-spin text-[#0058A3]" size={28} aria-hidden="true" />
                  <span className="text-sm font-medium">Karte und Route werden vorbereitet…</span>
                </div>
              ) : (
                <div
                  className="relative z-0 w-full overflow-hidden rounded-xl border border-gray-200"
                  style={{ height: "clamp(320px, 55vh, 560px)" }}
                >
                  <MapContainer
                    key={`tour-map-${tour.id}`}
                    center={FIRMA_COORDS}
                    zoom={12}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <InvalidateMapSize trigger={mobileMapOpen} />

                    {/* Startpunkt (Firma) */}
                    {startCoord ? (
                      <Marker position={startCoord} icon={startDivIcon}>
                        <Popup>
                          <b>Start</b>
                          <br />
                          {START_ADRESSE}
                          <br />
                          {FIRMA_COORDS[0].toFixed(6)}, {FIRMA_COORDS[1].toFixed(6)}
                        </Popup>
                      </Marker>
                    ) : null}

                    {/* Kundenstopps */}
                    {geoStopps
                      .filter((entry) => !!entry.coord)
                      .map(({ stopp, coord }, index) => (
                        <Marker
                          key={stopp.id || index}
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
                    {routeCoords.length > 0 ? (
                      <>
                        <Polyline positions={routeCoords} />
                        <FitToBounds
                          lineCoords={routeCoords}
                          markerCoords={markerCoords}
                        />
                      </>
                    ) : null}

                    {/* Falls OSRM keine Route liefert */}
                    {routeCoords.length === 0 && markerCoords.length > 0 ? (
                      <FitToBounds markerCoords={markerCoords} />
                    ) : null}
                  </MapContainer>
                </div>
              )}

              {missingGeoCount > 0 && !mapLoading ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                  {missingGeoCount === 1
                    ? "Eine Adresse konnte auf der Karte nicht eindeutig gefunden werden."
                    : `${missingGeoCount} Adressen konnten auf der Karte nicht eindeutig gefunden werden.`}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Je Stopp genau ein verstecktes Datei-Eingabefeld. Dadurch gibt es keine doppelten IDs. */}
      {tour
        ? stopps.map((stopp) => (
            <input
              key={`foto-input-${stopp.id}`}
              id={`foto-input-${stopp.id}`}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={(element) => {
                if (element) {
                  fileInputRefs.current[stopp.id] = element;
                } else {
                  delete fileInputRefs.current[stopp.id];
                }
              }}
              onChange={(event) => uploadFoto(stopp.id, event.target)}
            />
          ))
        : null}

      {/* Feste Fahrer-Aktionsleiste auf dem Smartphone. */}
      {tour && activeStopp ? (
        <div
          className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 shadow-[0_-8px_28px_rgba(15,23,42,0.14)] backdrop-blur lg:hidden"
          style={{
            zIndex: 1100,
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 px-3 pt-2">
            {activeStopNavigationUrl ? (
              <a
                href={activeStopNavigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-[#0058A3] px-2 py-2 text-white"
              >
                <Navigation size={20} aria-hidden="true" />
                <span className="text-xs font-semibold">Navigation</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-gray-200 px-2 py-2 text-gray-400"
              >
                <Navigation size={20} aria-hidden="true" />
                <span className="text-xs font-semibold">Navigation</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => triggerQuickPhoto(activeStopp.id)}
              disabled={activeFotos.length >= 3 || activeFotoBusy}
              className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-2 text-gray-800 transition hover:bg-gray-200 disabled:text-gray-400"
            >
              {activeFotoBusy ? (
                <Loader2 className="animate-spin" size={20} aria-hidden="true" />
              ) : (
                <Camera size={20} aria-hidden="true" />
              )}
              <span className="text-xs font-semibold">Foto {activeFotos.length}/3</span>
            </button>

            {activeStopp.telefon ? (
              <a
                href={telHref(activeStopp.telefon)}
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-green-600 px-2 py-2 text-white"
              >
                <Phone size={20} aria-hidden="true" />
                <span className="text-xs font-semibold">Anrufen</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowCallSheet(true)}
                disabled={stoppsMitTelefon.length === 0}
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-2 text-gray-800 transition hover:bg-gray-200 disabled:text-gray-400"
              >
                <Phone size={20} aria-hidden="true" />
                <span className="text-xs font-semibold">Nummern</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Schnell-Foto: Auswahl eines beliebigen Stopps */}
      {showQuickPhoto ? (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 1200 }}>
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/45"
            onClick={() => setShowQuickPhoto(false)}
            aria-label="Schnell-Foto schließen"
            tabIndex={-1}
          />

          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-photo-title"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4">
              <div>
                <h3 id="quick-photo-title" className="text-lg font-semibold text-[#0058A3]">
                  Foto für einen Stopp
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Stopp auswählen und direkt die Kamera öffnen.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition hover:bg-gray-200"
                onClick={() => setShowQuickPhoto(false)}
                aria-label="Schließen"
                title="Schließen"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[calc(78vh-96px)] space-y-2 overflow-y-auto p-3">
              {stopps.map((stopp, index) => {
                const count = (fotosMap[stopp.id] || []).length;
                const disabled = count >= 3 || !!fotoBusy[stopp.id];

                return (
                  <button
                    key={stopp.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => triggerQuickPhoto(stopp.id)}
                    disabled={disabled}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FA] font-bold text-[#0058A3]">
                      {stopp.position ?? index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold text-gray-900">
                        {stopp.kunde || "Ohne Kundenname"}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-gray-500">
                        {stopp.adresse || "Keine Adresse"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {fotoBusy[stopp.id] ? (
                        <Loader2 className="animate-spin text-[#0058A3]" size={20} aria-hidden="true" />
                      ) : (
                        <Camera className="text-[#0058A3]" size={20} aria-hidden="true" />
                      )}
                      <span className="mt-1 block text-[10px] font-semibold text-gray-500">
                        {count}/3
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Anrufen: Liste aller Stopps mit Telefonnummer */}
      {showCallSheet ? (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 1200 }}>
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/45"
            onClick={() => setShowCallSheet(false)}
            aria-label="Telefonliste schließen"
            tabIndex={-1}
          />

          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-sheet-title"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4">
              <div>
                <h3 id="call-sheet-title" className="text-lg font-semibold text-[#0058A3]">
                  Telefonnummern
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Nummer antippen, um den Anruf zu starten.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition hover:bg-gray-200"
                onClick={() => setShowCallSheet(false)}
                aria-label="Schließen"
                title="Schließen"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[calc(78vh-96px)] overflow-y-auto p-3">
              {stoppsMitTelefon.length === 0 ? (
                <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  Keine Telefonnummern vorhanden.
                </div>
              ) : (
                <div className="space-y-2">
                  {stoppsMitTelefon.map((stopp) => (
                    <a
                      key={stopp.id}
                      href={telHref(stopp.telefon)}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 transition hover:bg-gray-50"
                      onClick={() => setShowCallSheet(false)}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
                        <Phone size={20} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-gray-900">
                          {stopp.kunde || "Ohne Kundenname"}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-gray-500">
                          {stopp.adresse || "Keine Adresse"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[#0058A3]">
                        {stopp.telefon}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
