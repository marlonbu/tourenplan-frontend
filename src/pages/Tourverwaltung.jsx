// src/pages/Tourverwaltung.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit3,
  Filter,
  Info,
  ListOrdered,
  Loader2,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  MoveRight,
  Package,
  Phone,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Truck,
  UserRound,
  X,
} from "lucide-react";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toDateISO(raw) {
  const direct = String(raw || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fmt(raw) {
  const iso = toDateISO(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return raw || "–";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function telHref(raw) {
  if (!raw) return "";
  const cleaned = String(raw).replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
}

function getStatusKey(rawDate, todayISO) {
  const dateISO = toDateISO(rawDate);
  if (!dateISO) return "unbekannt";
  if (dateISO > todayISO) return "zukuenftig";
  if (dateISO < todayISO) return "vergangen";
  return "heute";
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

function formatPosition(value) {
  if (value === null || value === undefined || value === "") return "–";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function normalizePosition(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Die Position muss eine Zahl sein.");
  }
  return numeric;
}

function StatusBadge({ datum, todayISO }) {
  const status = getStatusKey(datum, todayISO);

  if (status === "zukuenftig") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#E8F8EE] px-2.5 py-1 text-xs font-semibold text-[#137A4B]">
        Zukünftig
      </span>
    );
  }

  if (status === "vergangen") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#FCE8E8] px-2.5 py-1 text-xs font-semibold text-[#9F1C1C]">
        Vergangen
      </span>
    );
  }

  if (status === "heute") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#E8F1FA] px-2.5 py-1 text-xs font-semibold text-[#0058A3]">
        Heute
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
      Unbekannt
    </span>
  );
}

function InlineNotice({ notice, onClose }) {
  if (!notice) return null;

  const variants = {
    success: {
      wrapper: "border-green-200 bg-green-50 text-green-800",
      icon: CheckCircle2,
    },
    warning: {
      wrapper: "border-amber-200 bg-amber-50 text-amber-900",
      icon: TriangleAlert,
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

  const current = variants[notice.type] || variants.info;
  const Icon = current.icon;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${current.wrapper}`}
      role={notice.type === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm leading-5">{notice.text}</div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current opacity-70 hover:bg-black/5 hover:opacity-100"
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

function FilterField({ id, label, children, help = "" }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}
      </label>
      {children}
      {help ? <div className="mt-1.5 text-xs leading-4 text-gray-500">{help}</div> : null}
    </div>
  );
}

function FilterChip({ children, onRemove }) {
  return (
    <span className="relative inline-flex items-center rounded-full border border-blue-200 bg-blue-50 py-1.5 pl-3 pr-9 text-xs font-semibold text-blue-800">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full hover:bg-blue-100"
        aria-label={`${children} entfernen`}
        title="Filter entfernen"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </span>
  );
}

function MobileDataRow({ icon: Icon, children, muted = false }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 shrink-0 text-[#0058A3]" size={17} aria-hidden="true" />
      <div className={`min-w-0 break-words ${muted ? "text-gray-500" : "text-gray-800"}`}>
        {children}
      </div>
    </div>
  );
}

function MobileStopDetails({ stopp }) {
  return (
    <div className="mt-3 space-y-2.5 text-sm">
      <MobileDataRow icon={MapPin} muted={!stopp.adresse}>
        {stopp.adresse ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              stopp.adresse
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 hover:underline"
          >
            {stopp.adresse}
          </a>
        ) : (
          "Keine Adresse"
        )}
      </MobileDataRow>

      <MobileDataRow icon={Phone} muted={!stopp.telefon}>
        {stopp.telefon ? (
          <a className="font-medium text-blue-700 hover:underline" href={telHref(stopp.telefon)}>
            {stopp.telefon}
          </a>
        ) : (
          "Keine Telefonnummer"
        )}
      </MobileDataRow>

      <MobileDataRow icon={Package} muted={!stopp.kommission}>
        {stopp.kommission || "Keine Kommission"}
      </MobileDataRow>

      <MobileDataRow icon={MessageSquareText} muted={!stopp.hinweis}>
        {stopp.hinweis || "Kein Hinweis"}
      </MobileDataRow>

      <MobileDataRow icon={Clock3} muted={!stopp.ankunft}>
        {stopp.ankunft || "Keine Ankunftszeit"}
      </MobileDataRow>
    </div>
  );
}

function MobileStopEditForm({ stoppId, draft, onChange, disabled }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <FilterField id={`stopp-${stoppId}-position-mobile`} label="Position">
        <input
          id={`stopp-${stoppId}-position-mobile`}
          type="number"
          inputMode="numeric"
          step="1"
          className="w-full"
          value={draft.position === 0 ? 0 : draft.position ?? ""}
          onChange={(event) => onChange(stoppId, "position", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <FilterField id={`stopp-${stoppId}-ankunft-mobile`} label="Ankunft">
        <input
          id={`stopp-${stoppId}-ankunft-mobile`}
          type="text"
          className="w-full"
          placeholder="z. B. 10:00 Uhr"
          value={draft.ankunft ?? ""}
          onChange={(event) => onChange(stoppId, "ankunft", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <FilterField id={`stopp-${stoppId}-kunde-mobile`} label="Kunde">
        <input
          id={`stopp-${stoppId}-kunde-mobile`}
          type="text"
          className="w-full"
          value={draft.kunde ?? ""}
          onChange={(event) => onChange(stoppId, "kunde", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <FilterField id={`stopp-${stoppId}-telefon-mobile`} label="Telefon">
        <input
          id={`stopp-${stoppId}-telefon-mobile`}
          type="tel"
          className="w-full"
          value={draft.telefon ?? ""}
          onChange={(event) => onChange(stoppId, "telefon", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <FilterField id={`stopp-${stoppId}-adresse-mobile`} label="Adresse">
        <input
          id={`stopp-${stoppId}-adresse-mobile`}
          type="text"
          className="w-full"
          value={draft.adresse ?? ""}
          onChange={(event) => onChange(stoppId, "adresse", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <FilterField id={`stopp-${stoppId}-kommission-mobile`} label="Kommission">
        <input
          id={`stopp-${stoppId}-kommission-mobile`}
          type="text"
          className="w-full"
          value={draft.kommission ?? ""}
          onChange={(event) => onChange(stoppId, "kommission", event.target.value)}
          disabled={disabled}
        />
      </FilterField>

      <div className="sm:col-span-2">
        <FilterField id={`stopp-${stoppId}-hinweis-mobile`} label="Hinweis">
          <textarea
            id={`stopp-${stoppId}-hinweis-mobile`}
            className="w-full resize-y"
            rows={3}
            value={draft.hinweis ?? ""}
            onChange={(event) => onChange(stoppId, "hinweis", event.target.value)}
            disabled={disabled}
          />
        </FilterField>
      </div>
    </div>
  );
}

export default function Tourverwaltung() {
  // Filter
  const [fahrer, setFahrer] = useState([]);
  const [filterFahrer, setFilterFahrer] = useState("");
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");
  const [filterKw, setFilterKw] = useState("");
  const [filterKunde, setFilterKunde] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    fahrer: "",
    von: "",
    bis: "",
    kw: "",
    kunde: "",
  });

  // Daten
  const [touren, setTouren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Stopps einer Tour
  const [stoppsMap, setStoppsMap] = useState({});
  const [loadingStopps, setLoadingStopps] = useState({});

  // Tour bearbeiten
  const [editTour, setEditTour] = useState({});
  const [tourBusy, setTourBusy] = useState({});

  // Stopps bearbeiten
  const [stoppEditing, setStoppEditing] = useState({});
  const [stoppDraft, setStoppDraft] = useState({});
  const [stoppBusy, setStoppBusy] = useState({});

  // Verschieben-Dialog
  const [moveModal, setMoveModal] = useState({
    open: false,
    srcTourId: null,
    stoppId: null,
    stoppKunde: "",
    targetFahrerId: "",
    targetDatum: "",
    busy: false,
    error: "",
  });

  // Alle | Zukünftig | Vergangen
  const [tab, setTab] = useState("alle");
  const todayISO = getTodayISO();

  useEffect(() => {
    void ladeFahrer();
    void ladeTouren();
  }, []);

  useEffect(() => {
    if (!moveModal.open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !moveModal.busy) closeMoveModal();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveModal.open, moveModal.busy]);

  const statusCounts = useMemo(() => {
    const counts = { alle: touren.length, heute: 0, zukuenftig: 0, vergangen: 0 };

    touren.forEach((tour) => {
      const status = getStatusKey(tour.datum, todayISO);
      if (status === "heute") counts.heute += 1;
      if (status === "zukuenftig") counts.zukuenftig += 1;
      if (status === "vergangen") counts.vergangen += 1;
    });

    return counts;
  }, [touren, todayISO]);

  const tourenGefiltert = useMemo(() => {
    if (tab === "zukuenftig") {
      return touren.filter((tour) => getStatusKey(tour.datum, todayISO) === "zukuenftig");
    }

    if (tab === "vergangen") {
      return touren.filter((tour) => getStatusKey(tour.datum, todayISO) === "vergangen");
    }

    return touren;
  }, [touren, tab, todayISO]);

  const visibleStopCount = useMemo(
    () =>
      tourenGefiltert.reduce((sum, tour) => {
        const count = Number(tour.stopps_count);
        return sum + (Number.isFinite(count) ? count : 0);
      }, 0),
    [tourenGefiltert]
  );

  const activeFilters = useMemo(() => {
    const items = [];
    const selectedDriver = fahrer.find(
      (entry) => String(entry.id) === String(appliedFilters.fahrer)
    );

    if (appliedFilters.fahrer) {
      items.push({
        key: "fahrer",
        label: `Fahrer: ${selectedDriver?.name || appliedFilters.fahrer}`,
      });
    }
    if (appliedFilters.kunde) {
      items.push({ key: "kunde", label: `Kunde: ${appliedFilters.kunde}` });
    }
    if (appliedFilters.von) {
      items.push({ key: "von", label: `Von: ${fmt(appliedFilters.von)}` });
    }
    if (appliedFilters.bis) {
      items.push({ key: "bis", label: `Bis: ${fmt(appliedFilters.bis)}` });
    }
    if (appliedFilters.kw) {
      items.push({ key: "kw", label: `Kalenderwoche: ${appliedFilters.kw}` });
    }

    return items;
  }, [fahrer, appliedFilters]);

  const advancedFilterCount = [
    appliedFilters.von,
    appliedFilters.bis,
    appliedFilters.kw,
  ].filter(Boolean).length;

  async function ladeFahrer() {
    try {
      const data = await api.listFahrer();
      setFahrer(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fahrer laden fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Fahrer konnten nicht geladen werden."),
      });
    }
  }

  function currentFilterValues() {
    return {
      fahrer: filterFahrer,
      von: filterVon,
      bis: filterBis,
      kw: filterKw,
      kunde: filterKunde.trim(),
    };
  }

  function writeFilterValues(filters) {
    setFilterFahrer(filters.fahrer || "");
    setFilterVon(filters.von || "");
    setFilterBis(filters.bis || "");
    setFilterKw(filters.kw || "");
    setFilterKunde(filters.kunde || "");
  }

  async function ladeTouren(
    filters = null,
    { clearExpanded = false, silent = false } = {}
  ) {
    const sourceValues = filters || currentFilterValues();
    const values = {
      fahrer: sourceValues.fahrer || "",
      von: sourceValues.von || "",
      bis: sourceValues.bis || "",
      kw: sourceValues.kw || "",
      kunde: String(sourceValues.kunde || "").trim(),
    };

    try {
      if (!silent) setLoading(true);
      setMsg("");
      setLoadError(false);

      if (clearExpanded) {
        setStoppsMap({});
        setStoppEditing({});
        setStoppDraft({});
      }

      const payload = {
        fahrer_id: values.fahrer || undefined,
        date_from: values.von || undefined,
        date_to: values.bis || undefined,
        kw: values.kw || undefined,
        kunde: values.kunde || undefined,
      };

      const data = await api.getTourenAdmin(payload);
      const rows = Array.isArray(data) ? data : [];
      setAppliedFilters(values);
      setTouren(rows);

      if (rows.length === 0) setMsg("Keine Touren gefunden.");
    } catch (error) {
      console.error("Touren laden fehlgeschlagen:", error);
      setLoadError(true);
      setMsg(getErrorMessage(error, "Die Touren konnten nicht geladen werden."));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleFilterSubmit(event) {
    event.preventDefault();

    if (filterVon && filterBis && filterVon > filterBis) {
      setActionNotice({
        type: "error",
        text: "Das Datum bei ‚Von‘ darf nicht nach dem Datum bei ‚Bis‘ liegen.",
      });
      return;
    }

    setActionNotice(null);
    await ladeTouren(null, { clearExpanded: true });
  }

  async function resetFilter() {
    const emptyFilters = {
      fahrer: "",
      von: "",
      bis: "",
      kw: "",
      kunde: "",
    };

    writeFilterValues(emptyFilters);
    setShowAdvancedFilters(false);
    setTab("alle");
    setActionNotice(null);
    await ladeTouren(emptyFilters, { clearExpanded: true });
  }

  async function removeAppliedFilter(key) {
    const nextFilters = { ...appliedFilters, [key]: "" };
    writeFilterValues(nextFilters);
    setActionNotice(null);
    await ladeTouren(nextFilters, { clearExpanded: true });
  }

  async function toggleStopps(tourId) {
    if (hasOwn(stoppsMap, tourId)) {
      const affectedStopps = stoppsMap[tourId] || [];

      setStoppsMap((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });

      const idsToClear = new Set(affectedStopps.map((stopp) => stopp.id));

      setStoppEditing((current) => {
        const next = { ...current };
        idsToClear.forEach((id) => delete next[id]);
        return next;
      });

      setStoppDraft((current) => {
        const next = { ...current };
        idsToClear.forEach((id) => delete next[id]);
        return next;
      });

      return;
    }

    if (loadingStopps[tourId]) return;

    try {
      setLoadingStopps((current) => ({ ...current, [tourId]: true }));
      const data = await api.getStoppsByTour(tourId);
      const stopps = Array.isArray(data) ? data : [];

      setStoppsMap((current) => ({ ...current, [tourId]: stopps }));
      setStoppDraft((current) => {
        const next = { ...current };

        stopps.forEach((stopp) => {
          next[stopp.id] = {
            position: stopp.position ?? "",
            ankunft: stopp.ankunft ?? "",
            kunde: stopp.kunde ?? "",
            adresse: stopp.adresse ?? "",
            telefon: stopp.telefon ?? "",
            kommission: stopp.kommission ?? "",
            hinweis: stopp.hinweis ?? "",
          };
        });

        return next;
      });
    } catch (error) {
      console.error("Stopps laden fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Stopps konnten nicht geladen werden."),
      });
    } finally {
      setLoadingStopps((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
    }
  }

  function startEditTour(tour) {
    setEditTour((current) => ({
      ...current,
      [tour.id]: {
        fahrer_id: tour.fahrer_id,
        datum: toDateISO(tour.datum),
        bemerkung: tour.bemerkung ?? "",
      },
    }));
  }

  function cancelEditTour(tourId) {
    setEditTour((current) => {
      const next = { ...current };
      delete next[tourId];
      return next;
    });
  }

  function changeTourDraft(tourId, field, value) {
    setEditTour((current) => ({
      ...current,
      [tourId]: {
        ...current[tourId],
        [field]: value,
      },
    }));
  }

  async function saveEditTour(tourId) {
    const draft = editTour[tourId];
    if (!draft || tourBusy[tourId]) return;

    if (!draft.fahrer_id || !draft.datum) {
      setActionNotice({
        type: "error",
        text: "Bitte wählen Sie einen Fahrer und ein Datum aus.",
      });
      return;
    }

    try {
      setTourBusy((current) => ({ ...current, [tourId]: "save" }));
      setActionNotice(null);

      await api.updateTour(tourId, {
        fahrer_id: Number(draft.fahrer_id),
        datum: toDateISO(draft.datum),
        bemerkung: draft.bemerkung ?? "",
      });

      cancelEditTour(tourId);
      await ladeTouren(appliedFilters, { silent: true });
      setActionNotice({ type: "success", text: "Die Tour wurde gespeichert." });
    } catch (error) {
      console.error("Tour speichern fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Tour konnte nicht gespeichert werden."),
      });
    } finally {
      setTourBusy((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
    }
  }

  async function deleteTour(tourId, stoppsCount, driverName, datum) {
    if (tourBusy[tourId]) return;

    const numericCount = Number(stoppsCount) || 0;
    const confirmed = window.confirm(
      numericCount > 0
        ? `Tour von ${driverName || "diesem Fahrer"} am ${fmt(
            datum
          )} mit ${numericCount} Stopps wirklich löschen? Alle Stopps und zugeordneten Fotos werden ebenfalls gelöscht.`
        : `Tour von ${driverName || "diesem Fahrer"} am ${fmt(datum)} wirklich löschen?`
    );

    if (!confirmed) return;

    try {
      setTourBusy((current) => ({ ...current, [tourId]: "delete" }));
      setActionNotice(null);
      await api.deleteTour(tourId);

      setTouren((current) => current.filter((tour) => tour.id !== tourId));
      setStoppsMap((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
      cancelEditTour(tourId);

      setActionNotice({ type: "success", text: "Die Tour wurde gelöscht." });
    } catch (error) {
      console.error("Tour löschen fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Tour konnte nicht gelöscht werden."),
      });
    } finally {
      setTourBusy((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
    }
  }

  function enterStoppEdit(stopp) {
    setStoppEditing((current) => ({ ...current, [stopp.id]: true }));
    setStoppDraft((current) => ({
      ...current,
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
    setStoppEditing((current) => {
      const next = { ...current };
      delete next[stoppId];
      return next;
    });
  }

  function changeStoppDraft(stoppId, field, value) {
    setStoppDraft((current) => ({
      ...current,
      [stoppId]: {
        ...current[stoppId],
        [field]: value,
      },
    }));
  }

  async function saveStopp(stoppId, tourId) {
    if (stoppBusy[stoppId]) return;

    try {
      const draft = stoppDraft[stoppId] || {};
      const payload = {
        position: normalizePosition(draft.position),
        ankunft: draft.ankunft ?? "",
        kunde: draft.kunde ?? "",
        adresse: draft.adresse ?? "",
        telefon: draft.telefon ?? "",
        kommission: draft.kommission ?? "",
        hinweis: draft.hinweis ?? "",
      };

      setStoppBusy((current) => ({ ...current, [stoppId]: "save" }));
      setActionNotice(null);

      const updatedStopp = await api.updateStopp(stoppId, payload);

      setStoppsMap((current) => ({
        ...current,
        [tourId]: (current[tourId] || []).map((stopp) =>
          stopp.id === stoppId ? { ...stopp, ...(updatedStopp || payload) } : stopp
        ),
      }));

      cancelStoppEdit(stoppId);
      await ladeTouren(appliedFilters, { silent: true });
      setActionNotice({ type: "success", text: "Der Stopp wurde gespeichert." });
    } catch (error) {
      console.error("Stopp speichern fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Der Stopp konnte nicht gespeichert werden."),
      });
    } finally {
      setStoppBusy((current) => {
        const next = { ...current };
        delete next[stoppId];
        return next;
      });
    }
  }

  async function deleteStopp(stoppId, tourId, customerName) {
    if (stoppBusy[stoppId]) return;

    const confirmed = window.confirm(
      `Stopp „${customerName || "Ohne Kundenname"}“ wirklich löschen? Zugeordnete Fotos und Fahrer-Anmerkungen sind danach in der App nicht mehr verfügbar.`
    );

    if (!confirmed) return;

    try {
      setStoppBusy((current) => ({ ...current, [stoppId]: "delete" }));
      setActionNotice(null);
      await api.deleteStopp(stoppId);

      setStoppsMap((current) => ({
        ...current,
        [tourId]: (current[tourId] || []).filter((stopp) => stopp.id !== stoppId),
      }));

      setStoppEditing((current) => {
        const next = { ...current };
        delete next[stoppId];
        return next;
      });

      setStoppDraft((current) => {
        const next = { ...current };
        delete next[stoppId];
        return next;
      });

      await ladeTouren(appliedFilters, { silent: true });
      setActionNotice({ type: "success", text: "Der Stopp wurde gelöscht." });
    } catch (error) {
      console.error("Stopp löschen fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Der Stopp konnte nicht gelöscht werden."),
      });
    } finally {
      setStoppBusy((current) => {
        const next = { ...current };
        delete next[stoppId];
        return next;
      });
    }
  }

  function openMoveModal(stopp, sourceTourId, defaultDriverId, defaultDate) {
    setMoveModal({
      open: true,
      srcTourId: sourceTourId,
      stoppId: stopp.id,
      stoppKunde: stopp.kunde || "Ohne Kundenname",
      targetFahrerId: defaultDriverId ?? "",
      targetDatum: toDateISO(defaultDate),
      busy: false,
      error: "",
    });
  }

  function closeMoveModal() {
    if (moveModal.busy) return;

    setMoveModal({
      open: false,
      srcTourId: null,
      stoppId: null,
      stoppKunde: "",
      targetFahrerId: "",
      targetDatum: "",
      busy: false,
      error: "",
    });
  }

  async function ensureTour(driverId, datum) {
    const existing = await api.getTour(driverId, datum);
    if (existing?.tour?.id) return existing.tour.id;

    const created = await api.createTour(driverId, datum);
    return created.id;
  }

  function findStoppInState(tourId, stoppId) {
    return (stoppsMap[tourId] || []).find((stopp) => stopp.id === stoppId);
  }

  async function performMove() {
    const { srcTourId, stoppId, targetFahrerId, targetDatum } = moveModal;

    if (!srcTourId || !stoppId || !targetFahrerId || !targetDatum) {
      setMoveModal((current) => ({
        ...current,
        error: "Bitte wählen Sie einen Ziel-Fahrer und ein Ziel-Datum aus.",
      }));
      return;
    }

    let newStopp = null;
    let sourceDeleted = false;

    try {
      setMoveModal((current) => ({ ...current, busy: true, error: "" }));

      const normalizedTargetDate = toDateISO(targetDatum);
      const targetTourId = await ensureTour(Number(targetFahrerId), normalizedTargetDate);

      if (String(targetTourId) === String(srcTourId)) {
        throw new Error("Der Stopp befindet sich bereits in dieser Tour. Bitte wählen Sie einen anderen Fahrer oder ein anderes Datum.");
      }

      const sourceStopp = findStoppInState(srcTourId, stoppId);
      if (!sourceStopp) throw new Error("Der zu verschiebende Stopp wurde nicht gefunden.");

      const payload = {
        kunde: sourceStopp.kunde || "",
        adresse: sourceStopp.adresse || "",
        telefon: sourceStopp.telefon || "",
        kommission: sourceStopp.kommission || "",
        hinweis: sourceStopp.hinweis || "",
        position: normalizePosition(sourceStopp.position),
        ankunft: sourceStopp.ankunft || "",
      };

      newStopp = await api.createStopp(targetTourId, payload);

      if (sourceStopp.anmerkung_fahrer) {
        const updated = await api.updateStopp(newStopp.id, {
          anmerkung_fahrer: sourceStopp.anmerkung_fahrer,
        });
        newStopp = { ...newStopp, ...(updated || {}) };
      }

      await api.deleteStopp(stoppId);
      sourceDeleted = true;

      setStoppsMap((current) => {
        const next = { ...current };
        next[srcTourId] = (next[srcTourId] || []).filter((stopp) => stopp.id !== stoppId);

        if (hasOwn(next, targetTourId)) {
          next[targetTourId] = [...(next[targetTourId] || []), newStopp];
        }

        return next;
      });

      setStoppEditing((current) => {
        const next = { ...current };
        delete next[stoppId];
        return next;
      });

      setStoppDraft((current) => {
        const next = { ...current };
        delete next[stoppId];

        if (hasOwn(stoppsMap, targetTourId)) {
          next[newStopp.id] = {
            position: newStopp.position ?? "",
            ankunft: newStopp.ankunft ?? "",
            kunde: newStopp.kunde ?? "",
            adresse: newStopp.adresse ?? "",
            telefon: newStopp.telefon ?? "",
            kommission: newStopp.kommission ?? "",
            hinweis: newStopp.hinweis ?? "",
          };
        }

        return next;
      });

      setMoveModal((current) => ({ ...current, open: false, busy: false, error: "" }));
      await ladeTouren(appliedFilters, { silent: true });
      setActionNotice({
        type: "warning",
        text: "Der Stopp wurde verschoben. Die Stoppdaten und eine vorhandene Fahrer-Anmerkung wurden übernommen. Fotos werden technisch nicht mitverschoben und sind am neuen Stopp nicht verfügbar.",
      });
    } catch (error) {
      console.error("Stopp verschieben fehlgeschlagen:", error);

      let rollbackFailed = false;
      if (newStopp?.id && !sourceDeleted) {
        try {
          await api.deleteStopp(newStopp.id);
        } catch (rollbackError) {
          console.error("Ruecknahme des neu angelegten Stopps fehlgeschlagen:", rollbackError);
          rollbackFailed = true;
        }
      }

      setMoveModal((current) => ({
        ...current,
        busy: false,
        error: rollbackFailed
          ? "Das Verschieben konnte nicht vollständig zurückgenommen werden. Bitte prüfen Sie Quell- und Ziel-Tour in der Liste."
          : getErrorMessage(error, "Der Stopp konnte nicht verschoben werden."),
      }));
    }
  }

  const tabOptions = [
    { key: "alle", label: "Alle", count: statusCounts.alle },
    { key: "zukuenftig", label: "Zukünftig", count: statusCounts.zukuenftig },
    { key: "vergangen", label: "Vergangen", count: statusCounts.vergangen },
  ];

  const showTabEmptyState = !loading && !msg && touren.length > 0 && tourenGefiltert.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tourverwaltung</h1>

      <InlineNotice notice={actionNotice} onClose={() => setActionNotice(null)} />

      <section className="space-y-5 bg-white p-4 shadow sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FA] text-[#0058A3]">
              <Filter size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-[#0058A3]">Touren zum Bearbeiten finden</h2>
              <p className="mt-0.5 text-sm leading-5 text-gray-600">
                Normale Aktionen stehen direkt bereit. Löschen ist bewusst getrennt und rot gekennzeichnet.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            aria-expanded={showAdvancedFilters}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            Weitere Filter
            {advancedFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0058A3] px-1.5 text-[11px] font-bold text-white">
                {advancedFilterCount}
              </span>
            ) : null}
            {showAdvancedFilters ? (
              <ChevronUp size={17} aria-hidden="true" />
            ) : (
              <ChevronDown size={17} aria-hidden="true" />
            )}
          </button>
        </div>

        <form onSubmit={handleFilterSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <FilterField id="verwaltung-filter-fahrer" label="Fahrer">
              <select
                id="verwaltung-filter-fahrer"
                className="w-full"
                value={filterFahrer}
                onChange={(event) => setFilterFahrer(event.target.value)}
                disabled={loading}
              >
                <option value="">Alle Fahrer</option>
                {fahrer.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="verwaltung-filter-kunde" label="Kunde">
              <input
                id="verwaltung-filter-kunde"
                type="search"
                className="w-full"
                placeholder="Kundenname eingeben"
                value={filterKunde}
                onChange={(event) => setFilterKunde(event.target.value)}
                disabled={loading}
              />
            </FilterField>
          </div>

          {showAdvancedFilters ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FilterField id="verwaltung-filter-von" label="Datum von">
                  <input
                    id="verwaltung-filter-von"
                    type="date"
                    className="w-full"
                    value={filterVon}
                    onChange={(event) => setFilterVon(event.target.value)}
                    disabled={loading}
                  />
                </FilterField>

                <FilterField id="verwaltung-filter-bis" label="Datum bis">
                  <input
                    id="verwaltung-filter-bis"
                    type="date"
                    className="w-full"
                    value={filterBis}
                    onChange={(event) => setFilterBis(event.target.value)}
                    disabled={loading}
                  />
                </FilterField>

                <FilterField
                  id="verwaltung-filter-kw"
                  label="Kalenderwoche"
                  help="Ein Datumsbereich hat Vorrang vor der Kalenderwoche."
                >
                  <input
                    id="verwaltung-filter-kw"
                    type="week"
                    className="w-full"
                    value={filterKw}
                    onChange={(event) => setFilterKw(event.target.value)}
                    disabled={loading}
                  />
                </FilterField>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {activeFilters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeFilters.map((item) => (
                    <FilterChip
                      key={item.key}
                      onRemove={() => removeAppliedFilter(item.key)}
                    >
                      {item.label}
                    </FilterChip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Ohne Filter werden alle Touren angezeigt.</p>
              )}
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={resetFilter}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                <RotateCcw size={17} aria-hidden="true" />
                Zurücksetzen
              </button>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-w-[165px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                ) : (
                  <Search size={18} aria-hidden="true" />
                )}
                {loading ? "Touren werden geladen..." : "Filter anwenden"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4 bg-white p-3 shadow sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full gap-2 overflow-x-auto pb-1 lg:w-auto lg:overflow-visible lg:pb-0">
            {tabOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTab(option.key)}
                className={`inline-flex min-w-fit items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  tab === option.key
                    ? "bg-[#0058A3] text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option.label}
                <span
                  className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                    tab === option.key ? "bg-white/20 text-white" : "bg-white text-gray-600"
                  }`}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Truck size={17} className="text-[#0058A3]" aria-hidden="true" />
              <strong className="text-gray-900">{tourenGefiltert.length}</strong> Touren
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListOrdered size={17} className="text-[#0058A3]" aria-hidden="true" />
              <strong className="text-gray-900">{visibleStopCount}</strong> Stopps
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={17} className="text-[#0058A3]" aria-hidden="true" />
              <strong className="text-gray-900">{statusCounts.heute}</strong> heute
            </span>
          </div>
        </div>
      </section>

      {/* Smartphone und Tablet */}
      <section className="space-y-3 lg:hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-10 text-sm text-gray-600 shadow-sm">
            <Loader2 className="animate-spin text-[#0058A3]" size={20} aria-hidden="true" />
            Touren werden geladen...
          </div>
        ) : null}

        {!loading && msg ? (
          <div
            className={`rounded-2xl border px-4 py-6 text-center text-sm shadow-sm ${
              loadError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {msg}
          </div>
        ) : null}

        {showTabEmptyState ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-600 shadow-sm">
            In diesem Bereich sind keine Touren vorhanden.
          </div>
        ) : null}

        {!loading
          ? tourenGefiltert.map((tour) => {
              const stoppsAreOpen = hasOwn(stoppsMap, tour.id);
              const stopps = stoppsAreOpen ? stoppsMap[tour.id] : [];
              const stoppsAreLoading = Boolean(loadingStopps[tour.id]);
              const isEditingTour = Boolean(editTour[tour.id]);
              const currentTourBusy = tourBusy[tour.id];

              return (
                <article
                  key={tour.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <CalendarDays size={14} aria-hidden="true" />
                        {fmt(tour.datum)}
                      </div>
                      <div className="mt-1 flex items-center gap-2 break-words text-base font-semibold text-[#0058A3]">
                        <UserRound size={17} className="shrink-0" aria-hidden="true" />
                        {tour.fahrer_name || "Ohne Fahrer"}
                      </div>
                    </div>
                    <StatusBadge datum={tour.datum} todayISO={todayISO} />
                  </div>

                  <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                    <div>
                      <strong>{Number(tour.stopps_count) || 0}</strong>{" "}
                      {Number(tour.stopps_count) === 1 ? "Stopp" : "Stopps"}
                    </div>
                    {tour.kunden_preview ? (
                      <div className="mt-1 break-words text-xs leading-5 text-gray-500">
                        {tour.kunden_preview}
                      </div>
                    ) : null}
                  </div>

                  {tour.bemerkung && !isEditingTour ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                      <MessageSquareText className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                      <span className="break-words">{tour.bemerkung}</span>
                    </div>
                  ) : null}

                  {isEditingTour ? (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                      <div className="mb-3 flex items-center gap-2 font-semibold text-[#0058A3]">
                        <Edit3 size={18} aria-hidden="true" />
                        Tour bearbeiten
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <FilterField id={`tour-${tour.id}-datum-mobile`} label="Datum">
                          <input
                            id={`tour-${tour.id}-datum-mobile`}
                            type="date"
                            className="w-full"
                            value={editTour[tour.id].datum || ""}
                            onChange={(event) =>
                              changeTourDraft(tour.id, "datum", event.target.value)
                            }
                            disabled={Boolean(currentTourBusy)}
                          />
                        </FilterField>

                        <FilterField id={`tour-${tour.id}-fahrer-mobile`} label="Fahrer">
                          <select
                            id={`tour-${tour.id}-fahrer-mobile`}
                            className="w-full"
                            value={editTour[tour.id].fahrer_id || ""}
                            onChange={(event) =>
                              changeTourDraft(tour.id, "fahrer_id", Number(event.target.value))
                            }
                            disabled={Boolean(currentTourBusy)}
                          >
                            {fahrer.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                          </select>
                        </FilterField>

                        <div className="sm:col-span-2">
                          <FilterField id={`tour-${tour.id}-bemerkung-mobile`} label="Bemerkung">
                            <textarea
                              id={`tour-${tour.id}-bemerkung-mobile`}
                              className="w-full resize-y"
                              rows={3}
                              value={editTour[tour.id].bemerkung || ""}
                              onChange={(event) =>
                                changeTourDraft(tour.id, "bemerkung", event.target.value)
                              }
                              disabled={Boolean(currentTourBusy)}
                            />
                          </FilterField>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {!isEditingTour ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleStopps(tour.id)}
                          disabled={stoppsAreLoading || Boolean(currentTourBusy)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                          aria-expanded={stoppsAreOpen}
                        >
                          {stoppsAreLoading ? (
                            <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                          ) : stoppsAreOpen ? (
                            <ChevronUp size={17} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={17} aria-hidden="true" />
                          )}
                          {stoppsAreLoading
                            ? "Stopps werden geladen..."
                            : stoppsAreOpen
                            ? "Stopps ausblenden"
                            : "Stopps anzeigen"}
                        </button>

                        <button
                          type="button"
                          onClick={() => startEditTour(tour)}
                          disabled={Boolean(currentTourBusy)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0058A3] bg-white px-3 py-2.5 text-sm font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60"
                        >
                          <Edit3 size={17} aria-hidden="true" />
                          Tour bearbeiten
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEditTour(tour.id)}
                          disabled={Boolean(currentTourBusy)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                        >
                          {currentTourBusy === "save" ? (
                            <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                          ) : (
                            <Save size={17} aria-hidden="true" />
                          )}
                          {currentTourBusy === "save" ? "Wird gespeichert..." : "Speichern"}
                        </button>

                        <button
                          type="button"
                          onClick={() => cancelEditTour(tour.id)}
                          disabled={Boolean(currentTourBusy)}
                          className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                        >
                          Abbrechen
                        </button>
                      </>
                    )}
                  </div>

                  {!isEditingTour ? (
                    <details className="group mt-2 rounded-xl border border-gray-200 bg-gray-50">
                      <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                        <MoreHorizontal size={17} aria-hidden="true" />
                        Weitere Aktionen
                        <ChevronDown
                          className="transition-transform group-open:rotate-180"
                          size={16}
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-gray-200 p-3">
                        <button
                          type="button"
                          onClick={() =>
                            deleteTour(
                              tour.id,
                              tour.stopps_count,
                              tour.fahrer_name,
                              tour.datum
                            )
                          }
                          disabled={Boolean(currentTourBusy)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {currentTourBusy === "delete" ? (
                            <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                          ) : (
                            <Trash2 size={17} aria-hidden="true" />
                          )}
                          {currentTourBusy === "delete" ? "Wird gelöscht..." : "Tour löschen"}
                        </button>
                      </div>
                    </details>
                  ) : null}

                  {stoppsAreOpen ? (
                    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-gray-900">Stopps dieser Tour</div>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                          {stopps.length}
                        </span>
                      </div>

                      {stopps.length === 0 ? (
                        <div className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                          Keine Stopps vorhanden
                        </div>
                      ) : (
                        stopps.map((stopp, index) => {
                          const isEditingStopp = Boolean(stoppEditing[stopp.id]);
                          const draft = stoppDraft[stopp.id] || {};
                          const currentStoppBusy = stoppBusy[stopp.id];

                          return (
                            <div
                              key={stopp.id}
                              className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Stopp {index + 1} · Position {formatPosition(stopp.position)}
                                  </div>
                                  <div className="mt-1 break-words text-sm font-semibold text-[#0058A3]">
                                    {stopp.kunde || "Ohne Kundenname"}
                                  </div>
                                </div>
                                {stopp.ankunft && !isEditingStopp ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#E8F1FA] px-2.5 py-1 text-xs font-semibold text-[#0058A3]">
                                    <Clock3 size={13} aria-hidden="true" />
                                    {stopp.ankunft}
                                  </span>
                                ) : null}
                              </div>

                              {!isEditingStopp ? (
                                <MobileStopDetails stopp={stopp} />
                              ) : (
                                <MobileStopEditForm
                                  stoppId={stopp.id}
                                  draft={draft}
                                  onChange={changeStoppDraft}
                                  disabled={Boolean(currentStoppBusy)}
                                />
                              )}

                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {!isEditingStopp ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => enterStoppEdit(stopp)}
                                      disabled={Boolean(currentStoppBusy)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0058A3] bg-white px-3 py-2.5 text-sm font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60"
                                    >
                                      <Edit3 size={17} aria-hidden="true" />
                                      Bearbeiten
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        openMoveModal(
                                          stopp,
                                          tour.id,
                                          tour.fahrer_id,
                                          tour.datum
                                        )
                                      }
                                      disabled={Boolean(currentStoppBusy)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                                    >
                                      <MoveRight size={17} aria-hidden="true" />
                                      Verschieben
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveStopp(stopp.id, tour.id)}
                                      disabled={Boolean(currentStoppBusy)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                                    >
                                      {currentStoppBusy === "save" ? (
                                        <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                                      ) : (
                                        <Save size={17} aria-hidden="true" />
                                      )}
                                      {currentStoppBusy === "save"
                                        ? "Wird gespeichert..."
                                        : "Speichern"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => cancelStoppEdit(stopp.id)}
                                      disabled={Boolean(currentStoppBusy)}
                                      className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                                    >
                                      Abbrechen
                                    </button>
                                  </>
                                )}
                              </div>

                              {!isEditingStopp ? (
                                <details className="group mt-2 rounded-xl border border-gray-200 bg-gray-50">
                                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                                    <MoreHorizontal size={17} aria-hidden="true" />
                                    Weitere Aktionen
                                    <ChevronDown
                                      className="transition-transform group-open:rotate-180"
                                      size={16}
                                      aria-hidden="true"
                                    />
                                  </summary>
                                  <div className="border-t border-gray-200 p-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        deleteStopp(stopp.id, tour.id, stopp.kunde)
                                      }
                                      disabled={Boolean(currentStoppBusy)}
                                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                                    >
                                      {currentStoppBusy === "delete" ? (
                                        <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                                      ) : (
                                        <Trash2 size={17} aria-hidden="true" />
                                      )}
                                      {currentStoppBusy === "delete"
                                        ? "Wird gelöscht..."
                                        : "Stopp löschen"}
                                    </button>
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })
          : null}
      </section>

      {/* Desktop */}
      <section className="hidden space-y-4 bg-white p-4 shadow lg:block xl:p-5">
        <div>
          <h2 className="text-xl font-semibold text-[#0058A3]">Touren bearbeiten</h2>
          <p className="mt-1 text-sm text-gray-600">
            Stopps werden direkt unter der jeweiligen Tour geöffnet. Rote Aktionen löschen Daten und bleiben deshalb klar getrennt.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-sm text-gray-600">
            <Loader2 className="animate-spin text-[#0058A3]" size={20} aria-hidden="true" />
            Touren werden geladen...
          </div>
        ) : null}

        {!loading && msg ? (
          <div
            className={`rounded-xl border px-4 py-6 text-center text-sm ${
              loadError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {msg}
          </div>
        ) : null}

        {showTabEmptyState ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
            In diesem Bereich sind keine Touren vorhanden.
          </div>
        ) : null}

        {!loading && tourenGefiltert.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-[1250px] w-full border-collapse text-sm">
              <thead className="bg-[#0058A3] text-white">
                <tr>
                  <th className="w-[135px] border-r border-white/15 px-3 py-3 text-left">Datum</th>
                  <th className="w-[190px] border-r border-white/15 px-3 py-3 text-left">Fahrer</th>
                  <th className="w-[80px] border-r border-white/15 px-3 py-3 text-left">Stopps</th>
                  <th className="border-r border-white/15 px-3 py-3 text-left">Kunden</th>
                  <th className="w-[260px] border-r border-white/15 px-3 py-3 text-left">Bemerkung</th>
                  <th className="w-[120px] border-r border-white/15 px-3 py-3 text-left">Status</th>
                  <th className="w-[360px] px-3 py-3 text-left">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {tourenGefiltert.map((tour) => {
                  const stoppsAreOpen = hasOwn(stoppsMap, tour.id);
                  const stopps = stoppsAreOpen ? stoppsMap[tour.id] : [];
                  const stoppsAreLoading = Boolean(loadingStopps[tour.id]);
                  const isEditingTour = Boolean(editTour[tour.id]);
                  const currentTourBusy = tourBusy[tour.id];

                  return (
                    <React.Fragment key={tour.id}>
                      <tr className="bg-white hover:bg-gray-50">
                        <td className="border-b border-gray-200 px-3 py-3">
                          {isEditingTour ? (
                            <input
                              type="date"
                              className="w-full min-w-[125px]"
                              value={editTour[tour.id].datum || ""}
                              onChange={(event) =>
                                changeTourDraft(tour.id, "datum", event.target.value)
                              }
                              disabled={Boolean(currentTourBusy)}
                              aria-label="Tourdatum"
                            />
                          ) : (
                            <span className="font-medium text-gray-900">{fmt(tour.datum)}</span>
                          )}
                        </td>

                        <td className="border-b border-gray-200 px-3 py-3">
                          {isEditingTour ? (
                            <select
                              className="w-full min-w-[175px]"
                              value={editTour[tour.id].fahrer_id || ""}
                              onChange={(event) =>
                                changeTourDraft(tour.id, "fahrer_id", Number(event.target.value))
                              }
                              disabled={Boolean(currentTourBusy)}
                              aria-label="Fahrer"
                            >
                              {fahrer.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                  {entry.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold text-[#0058A3]">
                              {tour.fahrer_name || "–"}
                            </span>
                          )}
                        </td>

                        <td className="border-b border-gray-200 px-3 py-3">
                          {Number(tour.stopps_count) || 0}
                        </td>

                        <td className="max-w-[360px] border-b border-gray-200 px-3 py-3">
                          {tour.kunden_preview || <span className="text-gray-400">–</span>}
                        </td>

                        <td className="border-b border-gray-200 px-3 py-3">
                          {isEditingTour ? (
                            <textarea
                              className="w-full min-w-[240px] resize-y"
                              rows={2}
                              value={editTour[tour.id].bemerkung || ""}
                              onChange={(event) =>
                                changeTourDraft(tour.id, "bemerkung", event.target.value)
                              }
                              disabled={Boolean(currentTourBusy)}
                              aria-label="Tourbemerkung"
                            />
                          ) : (
                            <span className="break-words">
                              {tour.bemerkung || <span className="text-gray-400">–</span>}
                            </span>
                          )}
                        </td>

                        <td className="border-b border-gray-200 px-3 py-3">
                          <StatusBadge datum={tour.datum} todayISO={todayISO} />
                        </td>

                        <td className="border-b border-gray-200 px-3 py-3">
                          {!isEditingTour ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleStopps(tour.id)}
                                disabled={stoppsAreLoading || Boolean(currentTourBusy)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                                aria-expanded={stoppsAreOpen}
                              >
                                {stoppsAreLoading ? (
                                  <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                                ) : stoppsAreOpen ? (
                                  <ChevronUp size={15} aria-hidden="true" />
                                ) : (
                                  <ChevronDown size={15} aria-hidden="true" />
                                )}
                                {stoppsAreLoading
                                  ? "Wird geladen..."
                                  : stoppsAreOpen
                                  ? "Stopps ausblenden"
                                  : "Stopps anzeigen"}
                              </button>

                              <button
                                type="button"
                                onClick={() => startEditTour(tour)}
                                disabled={Boolean(currentTourBusy)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0058A3] bg-white px-3 py-2 text-xs font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60"
                              >
                                <Edit3 size={15} aria-hidden="true" />
                                Bearbeiten
                              </button>

                              <span className="h-7 border-l border-gray-200" aria-hidden="true" />

                              <button
                                type="button"
                                onClick={() =>
                                  deleteTour(
                                    tour.id,
                                    tour.stopps_count,
                                    tour.fahrer_name,
                                    tour.datum
                                  )
                                }
                                disabled={Boolean(currentTourBusy)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                              >
                                {currentTourBusy === "delete" ? (
                                  <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                                ) : (
                                  <Trash2 size={15} aria-hidden="true" />
                                )}
                                {currentTourBusy === "delete" ? "Wird gelöscht..." : "Löschen"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => saveEditTour(tour.id)}
                                disabled={Boolean(currentTourBusy)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0058A3] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                              >
                                {currentTourBusy === "save" ? (
                                  <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                                ) : (
                                  <Save size={15} aria-hidden="true" />
                                )}
                                {currentTourBusy === "save" ? "Wird gespeichert..." : "Speichern"}
                              </button>

                              <button
                                type="button"
                                onClick={() => cancelEditTour(tour.id)}
                                disabled={Boolean(currentTourBusy)}
                                className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                              >
                                Abbrechen
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {stoppsAreOpen ? (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="border-b border-gray-200 px-4 py-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="font-semibold text-gray-900">
                                  Stopps von {tour.fahrer_name} am {fmt(tour.datum)}
                                </div>
                                <div className="mt-0.5 text-xs text-gray-500">
                                  {stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleStopps(tour.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-100"
                              >
                                <ChevronUp size={15} aria-hidden="true" />
                                Schließen
                              </button>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                              <table className="min-w-[1350px] w-full border-collapse text-sm">
                                <thead className="bg-gray-100 text-gray-700">
                                  <tr>
                                    <th className="w-[80px] border-b border-gray-200 px-3 py-2.5 text-left">Pos.</th>
                                    <th className="w-[135px] border-b border-gray-200 px-3 py-2.5 text-left">Ankunft</th>
                                    <th className="w-[190px] border-b border-gray-200 px-3 py-2.5 text-left">Kunde</th>
                                    <th className="w-[260px] border-b border-gray-200 px-3 py-2.5 text-left">Adresse</th>
                                    <th className="w-[170px] border-b border-gray-200 px-3 py-2.5 text-left">Telefon</th>
                                    <th className="w-[210px] border-b border-gray-200 px-3 py-2.5 text-left">Kommission</th>
                                    <th className="w-[260px] border-b border-gray-200 px-3 py-2.5 text-left">Hinweis</th>
                                    <th className="w-[340px] border-b border-gray-200 px-3 py-2.5 text-left">Aktionen</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stopps.length === 0 ? (
                                    <tr>
                                      <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                                        Keine Stopps vorhanden
                                      </td>
                                    </tr>
                                  ) : (
                                    stopps.map((stopp) => {
                                      const isEditingStopp = Boolean(stoppEditing[stopp.id]);
                                      const draft = stoppDraft[stopp.id] || {};
                                      const currentStoppBusy = stoppBusy[stopp.id];

                                      return (
                                        <tr key={stopp.id} className="hover:bg-gray-50">
                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                step="1"
                                                className="w-full min-w-[70px] text-center"
                                                value={draft.position === 0 ? 0 : draft.position ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "position",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Position"
                                              />
                                            ) : (
                                              <span className="font-semibold text-gray-700">
                                                {formatPosition(stopp.position)}
                                              </span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="text"
                                                className="w-full min-w-[125px]"
                                                value={draft.ankunft ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "ankunft",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Ankunft"
                                              />
                                            ) : (
                                              stopp.ankunft || <span className="text-gray-400">–</span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="text"
                                                className="w-full min-w-[180px]"
                                                value={draft.kunde ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "kunde",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Kunde"
                                              />
                                            ) : (
                                              <span className="font-medium text-gray-900">
                                                {stopp.kunde || "–"}
                                              </span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="text"
                                                className="w-full min-w-[250px]"
                                                value={draft.adresse ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "adresse",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Adresse"
                                              />
                                            ) : stopp.adresse ? (
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
                                              <span className="text-gray-400">–</span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="tel"
                                                className="w-full min-w-[160px]"
                                                value={draft.telefon ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "telefon",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Telefon"
                                              />
                                            ) : stopp.telefon ? (
                                              <a
                                                href={telHref(stopp.telefon)}
                                                className="text-blue-700 hover:underline"
                                              >
                                                {stopp.telefon}
                                              </a>
                                            ) : (
                                              <span className="text-gray-400">–</span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <input
                                                type="text"
                                                className="w-full min-w-[200px]"
                                                value={draft.kommission ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "kommission",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Kommission"
                                              />
                                            ) : (
                                              <span className="break-words">
                                                {stopp.kommission || (
                                                  <span className="text-gray-400">–</span>
                                                )}
                                              </span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {isEditingStopp ? (
                                              <textarea
                                                className="w-full min-w-[250px] resize-y"
                                                rows={2}
                                                value={draft.hinweis ?? ""}
                                                onChange={(event) =>
                                                  changeStoppDraft(
                                                    stopp.id,
                                                    "hinweis",
                                                    event.target.value
                                                  )
                                                }
                                                disabled={Boolean(currentStoppBusy)}
                                                aria-label="Hinweis"
                                              />
                                            ) : (
                                              <span className="break-words">
                                                {stopp.hinweis || (
                                                  <span className="text-gray-400">–</span>
                                                )}
                                              </span>
                                            )}
                                          </td>

                                          <td className="border-b border-gray-100 px-3 py-2.5">
                                            {!isEditingStopp ? (
                                              <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => enterStoppEdit(stopp)}
                                                  disabled={Boolean(currentStoppBusy)}
                                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0058A3] bg-white px-3 py-2 text-xs font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60"
                                                >
                                                  <Edit3 size={15} aria-hidden="true" />
                                                  Bearbeiten
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openMoveModal(
                                                      stopp,
                                                      tour.id,
                                                      tour.fahrer_id,
                                                      tour.datum
                                                    )
                                                  }
                                                  disabled={Boolean(currentStoppBusy)}
                                                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                                                >
                                                  <MoveRight size={15} aria-hidden="true" />
                                                  Verschieben
                                                </button>

                                                <span
                                                  className="h-7 border-l border-gray-200"
                                                  aria-hidden="true"
                                                />

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    deleteStopp(stopp.id, tour.id, stopp.kunde)
                                                  }
                                                  disabled={Boolean(currentStoppBusy)}
                                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                                                >
                                                  {currentStoppBusy === "delete" ? (
                                                    <Loader2
                                                      className="animate-spin"
                                                      size={15}
                                                      aria-hidden="true"
                                                    />
                                                  ) : (
                                                    <Trash2 size={15} aria-hidden="true" />
                                                  )}
                                                  {currentStoppBusy === "delete"
                                                    ? "Wird gelöscht..."
                                                    : "Löschen"}
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex flex-wrap gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => saveStopp(stopp.id, tour.id)}
                                                  disabled={Boolean(currentStoppBusy)}
                                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0058A3] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                                                >
                                                  {currentStoppBusy === "save" ? (
                                                    <Loader2
                                                      className="animate-spin"
                                                      size={15}
                                                      aria-hidden="true"
                                                    />
                                                  ) : (
                                                    <Save size={15} aria-hidden="true" />
                                                  )}
                                                  {currentStoppBusy === "save"
                                                    ? "Wird gespeichert..."
                                                    : "Speichern"}
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => cancelStoppEdit(stopp.id)}
                                                  disabled={Boolean(currentStoppBusy)}
                                                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                                                >
                                                  Abbrechen
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {moveModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/45"
            onClick={closeMoveModal}
            disabled={moveModal.busy}
            aria-label="Dialog schließen"
            tabIndex={-1}
          />

          <div
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-modal-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
              <div>
                <h3 id="move-modal-title" className="text-lg font-semibold text-[#0058A3]">
                  Stopp verschieben
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {moveModal.stoppKunde || "Ausgewählter Stopp"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeMoveModal}
                disabled={moveModal.busy}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                aria-label="Schließen"
                title="Schließen"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FilterField id="move-target-fahrer" label="Ziel-Fahrer">
                  <select
                    id="move-target-fahrer"
                    className="w-full"
                    value={moveModal.targetFahrerId}
                    onChange={(event) =>
                      setMoveModal((current) => ({
                        ...current,
                        targetFahrerId: event.target.value,
                        error: "",
                      }))
                    }
                    disabled={moveModal.busy}
                  >
                    <option value="">– bitte wählen –</option>
                    {fahrer.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField id="move-target-datum" label="Ziel-Datum">
                  <input
                    id="move-target-datum"
                    type="date"
                    className="w-full"
                    value={moveModal.targetDatum}
                    onChange={(event) =>
                      setMoveModal((current) => ({
                        ...current,
                        targetDatum: event.target.value,
                        error: "",
                      }))
                    }
                    disabled={moveModal.busy}
                  />
                </FilterField>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm leading-5 text-blue-900">
                Existiert für Fahrer und Datum noch keine Tour, wird sie automatisch angelegt.
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-900">
                <TriangleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                <span>
                  Kunde, Adresse, Telefon, Kommission, Hinweis, Position, Ankunft und eine vorhandene Fahrer-Anmerkung werden übernommen. Fotos können technisch nicht mitverschoben werden und sind am neuen Stopp nicht verfügbar.
                </span>
              </div>

              {moveModal.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
                  {moveModal.error}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
              <button
                type="button"
                onClick={closeMoveModal}
                disabled={moveModal.busy}
                className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-4 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
              >
                Abbrechen
              </button>

              <button
                type="button"
                onClick={performMove}
                disabled={moveModal.busy}
                className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-4 py-2.5 font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
              >
                {moveModal.busy ? (
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                ) : (
                  <MoveRight size={18} aria-hidden="true" />
                )}
                {moveModal.busy ? "Wird verschoben..." : "Verschieben"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
