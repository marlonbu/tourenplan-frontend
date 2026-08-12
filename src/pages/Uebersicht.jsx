// src/pages/Uebersicht.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Filter,
  GripVertical,
  Info,
  ListOrdered,
  Loader2,
  MapPin,
  MessageSquareText,
  Package,
  Phone,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Truck,
  UserRound,
  X,
} from "lucide-react";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function telHref(raw) {
  if (!raw) return "";
  const cleaned = String(raw).replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
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

function fmtDate(raw) {
  const iso = toDateISO(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return raw || "–";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function getStatusKey(rawDate, todayISO) {
  const dateISO = toDateISO(rawDate);
  if (!dateISO) return "unbekannt";
  if (dateISO > todayISO) return "zukuenftig";
  if (dateISO < todayISO) return "vergangen";
  return "heute";
}

function compareTourFallback(a, b) {
  const driverComparison = String(a?.fahrer_name || "").localeCompare(
    String(b?.fahrer_name || ""),
    "de",
    { sensitivity: "base" }
  );

  if (driverComparison !== 0) return driverComparison;
  return Number(a?.id || 0) - Number(b?.id || 0);
}

function sortTourenByDate(rows, tab, todayISO) {
  return [...rows].sort((a, b) => {
    const dateA = toDateISO(a?.datum);
    const dateB = toDateISO(b?.datum);

    if (!dateA && !dateB) return compareTourFallback(a, b);
    if (!dateA) return 1;
    if (!dateB) return -1;

    if (tab === "vergangen") {
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return compareTourFallback(a, b);
    }

    if (tab === "zukuenftig") {
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return compareTourFallback(a, b);
    }

    const groupForDate = (dateISO) => {
      if (dateISO === todayISO) return 0;
      if (dateISO > todayISO) return 1;
      return 2;
    };

    const groupA = groupForDate(dateA);
    const groupB = groupForDate(dateB);

    if (groupA !== groupB) return groupA - groupB;

    if (groupA === 1 && dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    if (groupA === 2 && dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    return compareTourFallback(a, b);
  });
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

function StatusBadge({ dateISO, todayISO }) {
  const status = getStatusKey(dateISO, todayISO);

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

function SortableRow({ children, id, disabled = false, showHandle = true }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: disabled || !showHandle,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : "auto",
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`bg-white hover:bg-gray-50 ${
        isDragging ? "opacity-80 ring-2 ring-inset ring-[#0058A3]" : ""
      }`}
    >
      {showHandle ? (
        <td className="dnd-col-handle w-[48px] border-b border-gray-200 px-2 py-3 text-center text-gray-400">
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            className="inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-lg hover:bg-gray-100 hover:text-[#0058A3] active:cursor-grabbing disabled:cursor-not-allowed"
            aria-label="Tour verschieben"
            title="Ziehen, um die Reihenfolge zu ändern"
          >
            <GripVertical size={18} aria-hidden="true" />
          </button>
        </td>
      ) : null}
      {children}
    </tr>
  );
}

function SortableCard({ id, children, disabled = false, showHandle = true }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: disabled || !showHandle,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : "auto",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        isDragging ? "border-[#0058A3] opacity-85 ring-2 ring-[#0058A3]/30" : "border-gray-200"
      }`}
    >
      {showHandle ? (
        <div className="flex items-start gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            className="inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-[#E8F1FA] hover:text-[#0058A3] active:cursor-grabbing disabled:cursor-not-allowed"
            aria-label="Tour verschieben"
            title="Ziehen, um die Reihenfolge zu ändern"
          >
            <GripVertical size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}
    </article>
  );
}

function MobileStopCard({ stopp, index }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stopp {index + 1} · Position {formatPosition(stopp.position)}
          </div>
          <div className="mt-1 break-words text-sm font-semibold text-[#0058A3]">
            {stopp.kunde || "Ohne Kundenname"}
          </div>
        </div>
        {stopp.ankunft ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#E8F1FA] px-2.5 py-1 text-xs font-semibold text-[#0058A3]">
            <Clock3 size={13} aria-hidden="true" />
            {stopp.ankunft}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 shrink-0 text-[#0058A3]" size={17} aria-hidden="true" />
          {stopp.adresse ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                stopp.adresse
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words font-medium text-blue-700 hover:underline"
            >
              {stopp.adresse}
            </a>
          ) : (
            <span className="text-gray-500">Keine Adresse</span>
          )}
        </div>

        <div className="flex items-start gap-2.5">
          <Phone className="mt-0.5 shrink-0 text-[#0058A3]" size={17} aria-hidden="true" />
          {stopp.telefon ? (
            <a className="font-medium text-blue-700 hover:underline" href={telHref(stopp.telefon)}>
              {stopp.telefon}
            </a>
          ) : (
            <span className="text-gray-500">Keine Telefonnummer</span>
          )}
        </div>

        <div className="flex items-start gap-2.5">
          <Package className="mt-0.5 shrink-0 text-[#0058A3]" size={17} aria-hidden="true" />
          <span className="break-words">
            {stopp.kommission || <span className="text-gray-500">Keine Kommission</span>}
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <MessageSquareText
            className="mt-0.5 shrink-0 text-[#0058A3]"
            size={17}
            aria-hidden="true"
          />
          <span className="break-words">
            {stopp.hinweis || <span className="text-gray-500">Kein Hinweis</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

function StoppsTable({ stopps }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-[980px] w-full border-collapse text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Pos.</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Kunde</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Adresse</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Telefon</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Kommission</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Hinweis</th>
            <th className="border-b border-gray-200 px-3 py-2.5 text-left">Ankunft</th>
          </tr>
        </thead>
        <tbody>
          {stopps.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                Keine Stopps vorhanden
              </td>
            </tr>
          ) : (
            stopps.map((stopp) => (
              <tr key={stopp.id} className="hover:bg-gray-50">
                <td className="border-b border-gray-100 px-3 py-2.5 text-center font-semibold text-gray-700">
                  {formatPosition(stopp.position)}
                </td>
                <td className="border-b border-gray-100 px-3 py-2.5 font-medium text-gray-900">
                  {stopp.kunde || "–"}
                </td>
                <td className="max-w-[280px] border-b border-gray-100 px-3 py-2.5">
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
                    <span className="text-gray-400">–</span>
                  )}
                </td>
                <td className="border-b border-gray-100 px-3 py-2.5">
                  {stopp.telefon ? (
                    <a className="text-blue-700 hover:underline" href={telHref(stopp.telefon)}>
                      {stopp.telefon}
                    </a>
                  ) : (
                    <span className="text-gray-400">–</span>
                  )}
                </td>
                <td className="max-w-[240px] break-words border-b border-gray-100 px-3 py-2.5">
                  {stopp.kommission || <span className="text-gray-400">–</span>}
                </td>
                <td className="max-w-[280px] break-words border-b border-gray-100 px-3 py-2.5">
                  {stopp.hinweis || <span className="text-gray-400">–</span>}
                </td>
                <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2.5">
                  {stopp.ankunft || <span className="text-gray-400">–</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function reorderVisibleIds(previousOrder, visibleIds, reorderedVisibleIds) {
  const visibleSet = new Set(visibleIds);
  const slots = [];

  previousOrder.forEach((id, index) => {
    if (visibleSet.has(id)) slots.push(index);
  });

  const nextOrder = [...previousOrder];
  reorderedVisibleIds.forEach((id, index) => {
    if (slots[index] !== undefined) nextOrder[slots[index]] = id;
  });

  return nextOrder;
}

export default function Uebersicht() {
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

  // Stopps je Tour
  const [openStops, setOpenStops] = useState({});
  const [loadingStops, setLoadingStops] = useState({});

  // Tab-Ansicht: alle | zukuenftig | vergangen
  const [tab, setTab] = useState("alle");

  // Sortierung und Drag-and-drop
  const [sortMode, setSortMode] = useState("date");
  const [ordered, setOrdered] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const isManualSort = sortMode === "manual";
  const isDraggingTable = isManualSort && activeId !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } })
  );

  const todayISO = getTodayISO();

  useEffect(() => {
    void ladeFahrer();
    void ladeTouren();
  }, []);

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

  async function ladeTouren(filters = null, { clearExpanded = false } = {}) {
    const sourceValues = filters || currentFilterValues();
    const values = {
      fahrer: sourceValues.fahrer || "",
      von: sourceValues.von || "",
      bis: sourceValues.bis || "",
      kw: sourceValues.kw || "",
      kunde: String(sourceValues.kunde || "").trim(),
    };

    try {
      setLoading(true);
      setMsg("");
      setLoadError(false);

      if (clearExpanded) setOpenStops({});

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
      setOrdered(rows.map((tour) => tour.id));

      if (rows.length === 0) setMsg("Keine Touren gefunden.");
    } catch (error) {
      console.error("Touren laden fehlgeschlagen:", error);
      setLoadError(true);
      setMsg(getErrorMessage(error, "Die Touren konnten nicht geladen werden."));
    } finally {
      setLoading(false);
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

  const gefiltert = useMemo(() => {
    let rows = touren;

    if (tab === "zukuenftig") {
      rows = rows.filter((tour) => getStatusKey(tour.datum, todayISO) === "zukuenftig");
    } else if (tab === "vergangen") {
      rows = rows.filter((tour) => getStatusKey(tour.datum, todayISO) === "vergangen");
    }

    if (!isManualSort) {
      return sortTourenByDate(rows, tab, todayISO);
    }

    const visibleSet = new Set(rows.map((tour) => tour.id));
    const mapById = new Map(rows.map((tour) => [tour.id, tour]));
    const sortedRows = ordered
      .filter((id) => visibleSet.has(id))
      .map((id) => mapById.get(id))
      .filter(Boolean);
    const sortedIds = new Set(sortedRows.map((tour) => tour.id));
    const missingRows = rows.filter((tour) => !sortedIds.has(tour.id));

    return [...sortedRows, ...missingRows];
  }, [touren, tab, todayISO, ordered, isManualSort]);

  const visibleStopCount = useMemo(
    () =>
      gefiltert.reduce((sum, tour) => {
        const count = Number(tour.stopps_count);
        return sum + (Number.isFinite(count) ? count : 0);
      }, 0),
    [gefiltert]
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
      items.push({ key: "von", label: `Von: ${fmtDate(appliedFilters.von)}` });
    }
    if (appliedFilters.bis) {
      items.push({ key: "bis", label: `Bis: ${fmtDate(appliedFilters.bis)}` });
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

  async function toggleStopps(tour) {
    const tourId = tour.id;

    if (hasOwn(openStops, tourId)) {
      setOpenStops((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
      return;
    }

    if (loadingStops[tourId]) return;

    try {
      setLoadingStops((current) => ({ ...current, [tourId]: true }));
      const data = await api.getStoppsByTour(tourId);
      setOpenStops((current) => ({
        ...current,
        [tourId]: Array.isArray(data) ? data : [],
      }));
    } catch (error) {
      console.error("Stopps laden fehlgeschlagen:", error);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Stopps konnten nicht geladen werden."),
      });
    } finally {
      setLoadingStops((current) => {
        const next = { ...current };
        delete next[tourId];
        return next;
      });
    }
  }

  function handleDragStart(event) {
    if (!isManualSort) return;
    setActiveId(event.active.id);
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);

    if (!isManualSort || !over || active.id === over.id || reorderSaving) return;

    const visibleIds = gefiltert.map((tour) => tour.id);
    const oldIndex = visibleIds.indexOf(active.id);
    const newIndex = visibleIds.indexOf(over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedVisibleIds = arrayMove(visibleIds, oldIndex, newIndex);
    const previousOrder = [...ordered];
    const nextOrder = reorderVisibleIds(previousOrder, visibleIds, reorderedVisibleIds);

    setOrdered(nextOrder);
    setReorderSaving(true);
    setActionNotice(null);

    try {
      await api.reorderTouren(reorderedVisibleIds);
    } catch (error) {
      console.error("Reihenfolge speichern fehlgeschlagen:", error);
      setOrdered(previousOrder);
      setActionNotice({
        type: "error",
        text: getErrorMessage(error, "Die Reihenfolge konnte nicht gespeichert werden."),
      });
      await ladeTouren(appliedFilters);
    } finally {
      setReorderSaving(false);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function changeSortMode(nextMode) {
    if (reorderSaving || nextMode === sortMode) return;
    setActiveId(null);
    setSortMode(nextMode);
  }

  const tabOptions = [
    { key: "alle", label: "Alle", count: statusCounts.alle },
    { key: "zukuenftig", label: "Zukünftig", count: statusCounts.zukuenftig },
    { key: "vergangen", label: "Vergangen", count: statusCounts.vergangen },
  ];

  const showTabEmptyState = !loading && !msg && touren.length > 0 && gefiltert.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Gesamtübersicht</h1>

      <InlineNotice notice={actionNotice} onClose={() => setActionNotice(null)} />

      <section className="space-y-5 bg-white p-4 shadow sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FA] text-[#0058A3]">
                <Filter size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[#0058A3]">Touren finden</h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  Fahrer und Kunde sind direkt sichtbar. Zeitraum und Kalenderwoche finden Sie unter weitere Filter.
                </p>
              </div>
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
            <FilterField id="uebersicht-filter-fahrer" label="Fahrer">
              <select
                id="uebersicht-filter-fahrer"
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

            <FilterField id="uebersicht-filter-kunde" label="Kunde">
              <input
                id="uebersicht-filter-kunde"
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
                <FilterField id="uebersicht-filter-von" label="Datum von">
                  <input
                    id="uebersicht-filter-von"
                    type="date"
                    className="w-full"
                    value={filterVon}
                    onChange={(event) => setFilterVon(event.target.value)}
                    disabled={loading}
                  />
                </FilterField>

                <FilterField id="uebersicht-filter-bis" label="Datum bis">
                  <input
                    id="uebersicht-filter-bis"
                    type="date"
                    className="w-full"
                    value={filterBis}
                    onChange={(event) => setFilterBis(event.target.value)}
                    disabled={loading}
                  />
                </FilterField>

                <FilterField
                  id="uebersicht-filter-kw"
                  label="Kalenderwoche"
                  help="Ein Datumsbereich hat Vorrang vor der Kalenderwoche."
                >
                  <input
                    id="uebersicht-filter-kw"
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
              <strong className="text-gray-900">{gefiltert.length}</strong> Touren
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

        <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full rounded-xl bg-white p-1 ring-1 ring-inset ring-gray-200 sm:w-auto">
            <button
              type="button"
              onClick={() => changeSortMode("date")}
              disabled={reorderSaving}
              className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none ${
                !isManualSort
                  ? "bg-[#0058A3] text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              aria-pressed={!isManualSort}
            >
              <CalendarDays size={17} aria-hidden="true" />
              Nach Datum
            </button>

            <button
              type="button"
              onClick={() => changeSortMode("manual")}
              disabled={reorderSaving}
              className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none ${
                isManualSort
                  ? "bg-[#0058A3] text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              aria-pressed={isManualSort}
            >
              <GripVertical size={17} aria-hidden="true" />
              Manuell sortieren
            </button>
          </div>

          <div className="flex min-w-0 items-start gap-2 text-xs leading-5 text-gray-600 sm:max-w-2xl sm:text-right">
            {isManualSort ? (
              <GripVertical className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            ) : (
              <CalendarDays className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            )}
            <span>
              {isManualSort
                ? `Die Touren können am Griff verschoben werden. Die gespeicherte Reihenfolge bleibt erhalten.${
                    reorderSaving ? " Reihenfolge wird gerade gespeichert..." : ""
                  }`
                : "Heute steht oben. Danach folgen die nächsten Touren; vergangene Touren werden mit der zuletzt gefahrenen zuerst angezeigt."}
            </span>
          </div>
        </div>
      </section>

      {/* Smartphone und Tablet: Kartenansicht */}
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

        {!loading && gefiltert.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={gefiltert.map((tour) => tour.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {gefiltert.map((tour) => {
                  const stoppsAreOpen = hasOwn(openStops, tour.id);
                  const stopps = stoppsAreOpen ? openStops[tour.id] : [];
                  const stoppsAreLoading = Boolean(loadingStops[tour.id]);

                  return (
                    <SortableCard
                      key={tour.id}
                      id={tour.id}
                      disabled={reorderSaving || loading || !isManualSort}
                      showHandle={isManualSort}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                            <CalendarDays size={14} aria-hidden="true" />
                            {fmtDate(tour.datum)}
                          </div>
                          <div className="mt-1 flex items-center gap-2 break-words text-base font-semibold text-[#0058A3]">
                            <UserRound size={17} className="shrink-0" aria-hidden="true" />
                            {tour.fahrer_name || "Ohne Fahrer"}
                          </div>
                        </div>
                        <StatusBadge dateISO={tour.datum} todayISO={todayISO} />
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

                      <button
                        type="button"
                        onClick={() => toggleStopps(tour)}
                        disabled={stoppsAreLoading}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
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

                      {stoppsAreOpen ? (
                        <div className="mt-3 space-y-2.5 border-t border-gray-200 pt-3">
                          {stopps.length === 0 ? (
                            <div className="rounded-xl bg-gray-50 px-3 py-5 text-center text-sm text-gray-500">
                              Keine Stopps vorhanden
                            </div>
                          ) : (
                            stopps.map((stopp, index) => (
                              <MobileStopCard key={stopp.id} stopp={stopp} index={index} />
                            ))
                          )}
                        </div>
                      ) : null}
                    </SortableCard>
                  );
                })}
              </div>
            </SortableContext>
            <DragOverlay />
          </DndContext>
        ) : null}
      </section>

      {/* Desktop: Tabelle */}
      <section className="hidden space-y-4 bg-white p-4 shadow lg:block xl:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#0058A3]">Touren</h2>
            <p className="mt-1 text-sm text-gray-600">
              Stopps können direkt unter der jeweiligen Tour ein- und ausgeblendet werden.
            </p>
          </div>
          {reorderSaving ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-[#E8F1FA] px-3 py-1.5 text-xs font-semibold text-[#0058A3]">
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
              Reihenfolge wird gespeichert
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
              {isManualSort ? (
                <GripVertical size={14} aria-hidden="true" />
              ) : (
                <CalendarDays size={14} aria-hidden="true" />
              )}
              {isManualSort ? "Manuelle Reihenfolge" : "Nach Datum sortiert"}
            </span>
          )}
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

        {!loading && gefiltert.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={gefiltert.map((tour) => tour.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table
                  className={`${isManualSort ? "min-w-[1120px]" : "min-w-[1070px]"} w-full border-collapse text-sm`}
                >
                  <thead className="bg-[#0058A3] text-white">
                    <tr>
                      {isManualSort ? (
                        <th className="w-[48px] border-r border-white/15 px-2 py-3 text-center">
                          <span className="sr-only">Reihenfolge</span>
                        </th>
                      ) : null}
                      <th className="w-[135px] border-r border-white/15 px-3 py-3 text-left">Datum</th>
                      <th className="w-[210px] border-r border-white/15 px-3 py-3 text-left">Fahrer</th>
                      <th className="w-[90px] border-r border-white/15 px-3 py-3 text-left">Stopps</th>
                      <th className="border-r border-white/15 px-3 py-3 text-left">Kunden</th>
                      <th className="w-[125px] border-r border-white/15 px-3 py-3 text-left">Status</th>
                      <th className="w-[205px] px-3 py-3 text-left">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className={`dnd-table-body ${isDraggingTable ? "dragging" : ""}`}>
                    {gefiltert.map((tour) => {
                      const stoppsAreOpen = hasOwn(openStops, tour.id);
                      const stopps = stoppsAreOpen ? openStops[tour.id] : [];
                      const stoppsAreLoading = Boolean(loadingStops[tour.id]);

                      return (
                        <React.Fragment key={tour.id}>
                          <SortableRow
                            id={tour.id}
                            disabled={reorderSaving || loading || !isManualSort}
                            showHandle={isManualSort}
                          >
                            <td className="w-[135px] border-b border-gray-200 px-3 py-3 font-medium text-gray-900">
                              {fmtDate(tour.datum)}
                            </td>
                            <td className="w-[210px] border-b border-gray-200 px-3 py-3 font-semibold text-[#0058A3]">
                              {tour.fahrer_name || "–"}
                            </td>
                            <td className="w-[90px] border-b border-gray-200 px-3 py-3">
                              {Number(tour.stopps_count) || 0}
                            </td>
                            <td className="max-w-[460px] border-b border-gray-200 px-3 py-3">
                              {tour.kunden_preview || <span className="text-gray-400">–</span>}
                            </td>
                            <td className="w-[125px] border-b border-gray-200 px-3 py-3">
                              <StatusBadge dateISO={tour.datum} todayISO={todayISO} />
                            </td>
                            <td className="w-[205px] border-b border-gray-200 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => toggleStopps(tour)}
                                disabled={stoppsAreLoading}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                                aria-expanded={stoppsAreOpen}
                              >
                                {stoppsAreLoading ? (
                                  <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                                ) : stoppsAreOpen ? (
                                  <ChevronUp size={16} aria-hidden="true" />
                                ) : (
                                  <ChevronDown size={16} aria-hidden="true" />
                                )}
                                {stoppsAreLoading
                                  ? "Wird geladen..."
                                  : stoppsAreOpen
                                  ? "Stopps ausblenden"
                                  : "Stopps anzeigen"}
                              </button>
                            </td>
                          </SortableRow>

                          {!isDraggingTable && stoppsAreOpen ? (
                            <tr className="dnd-row-stopps bg-gray-50">
                              <td colSpan={isManualSort ? 7 : 6} className="border-b border-gray-200 px-4 py-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-gray-900">
                                      Stopps von {tour.fahrer_name} am {fmtDate(tour.datum)}
                                    </div>
                                    <div className="mt-0.5 text-xs text-gray-500">
                                      {stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => toggleStopps(tour)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-100"
                                  >
                                    <ChevronUp size={15} aria-hidden="true" />
                                    Schließen
                                  </button>
                                </div>
                                <StoppsTable stopps={stopps} />
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SortableContext>
            <DragOverlay />
          </DndContext>
        ) : null}
      </section>
    </div>
  );
}
