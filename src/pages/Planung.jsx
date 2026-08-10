// src/pages/Planung.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Info,
  Loader2,
  MapPin,
  Package,
  Phone,
  Plus,
  Settings,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../api";

function createEmptyStopp() {
  return {
    kunde: "",
    adresse: "",
    telefon: "",
    kommission: "",
    hinweis: "",
    position: "",
    ankunft: "",
  };
}

function telHref(raw) {
  if (!raw) return "";
  const cleaned = String(raw).replace(/[()\s\-\/]/g, "");
  return `tel:${cleaned}`;
}

function formatDate(rawDate) {
  const datePart = String(rawDate || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (!match) return rawDate || "–";

  return `${match[3]}.${match[2]}.${match[1]}`;
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

function InlineNotice({ notice, onClose, compact = false }) {
  if (!notice) return null;

  const styles = {
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

  const current = styles[notice.type] || styles.info;
  const Icon = current.icon;

  return (
    <div
      className={`rounded-xl border ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${
        current.wrapper
      }`}
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

function StepItem({ number, title, description, complete, active }) {
  const wrapperClass = complete
    ? "border-green-200 bg-green-50"
    : active
    ? "border-blue-200 bg-blue-50"
    : "border-gray-200 bg-gray-50";

  const markerClass = complete
    ? "bg-green-600 text-white"
    : active
    ? "bg-[#0058A3] text-white"
    : "bg-white text-gray-500 ring-1 ring-inset ring-gray-300";

  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${wrapperClass}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${markerClass}`}
      >
        {complete ? <CheckCircle2 size={19} aria-hidden="true" /> : number}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gray-900">{title}</span>
        <span className="mt-0.5 hidden text-xs leading-4 text-gray-500 sm:block">
          {description}
        </span>
      </span>
    </div>
  );
}

function FormField({ id, label, required = false, help = "", className = "", children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
      {help ? <div className="mt-1.5 text-xs leading-4 text-gray-500">{help}</div> : null}
    </div>
  );
}

export default function Planung() {
  const [fahrer, setFahrer] = useState([]);
  const [fahrerLoading, setFahrerLoading] = useState(true);
  const [selectedFahrer, setSelectedFahrer] = useState("");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [tour, setTour] = useState(null);
  const [stopps, setStopps] = useState([]);
  const [neuStopp, setNeuStopp] = useState(() => createEmptyStopp());

  const [notice, setNotice] = useState(null);
  const [stoppNotice, setStoppNotice] = useState(null);
  const [tourBusy, setTourBusy] = useState("");
  const [stoppBusy, setStoppBusy] = useState(false);

  // Modal: Fahrer verwalten
  const [showManage, setShowManage] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageNotice, setManageNotice] = useState(null);

  const selectedDriver = useMemo(
    () => fahrer.find((entry) => String(entry.id) === String(selectedFahrer)) || null,
    [fahrer, selectedFahrer]
  );

  const selectedDriverName = selectedDriver?.name || "Ausgewählter Fahrer";
  const hasTourSelection = Boolean(selectedFahrer && datum);
  const isTourBusy = Boolean(tourBusy);

  useEffect(() => {
    ladeFahrer();
  }, []);

  useEffect(() => {
    if (!showManage) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !manageBusy) {
        closeManage();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showManage, manageBusy]);

  async function ladeFahrer() {
    try {
      setFahrerLoading(true);
      const data = await api.listFahrer();
      setFahrer(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fehler beim Laden der Fahrer:", error);
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Die Fahrer konnten nicht geladen werden."),
      });
    } finally {
      setFahrerLoading(false);
    }
  }

  function clearOpenedTour() {
    setTour(null);
    setStopps([]);
    setNeuStopp(createEmptyStopp());
    setStoppNotice(null);
  }

  function handleFahrerChange(event) {
    setSelectedFahrer(event.target.value);
    clearOpenedTour();
    setNotice(null);
  }

  function handleDatumChange(event) {
    setDatum(event.target.value);
    clearOpenedTour();
    setNotice(null);
  }

  function validateTourSelection() {
    if (!selectedFahrer) {
      setNotice({
        type: "info",
        text: "Bitte wählen Sie zuerst einen Fahrer aus.",
      });
      return false;
    }

    if (!datum) {
      setNotice({
        type: "info",
        text: "Bitte wählen Sie ein Datum aus.",
      });
      return false;
    }

    return true;
  }

  // ---- Tour ----
  async function ladeTour() {
    if (!validateTourSelection() || isTourBusy) return;

    try {
      setTourBusy("load");
      setNotice(null);
      setStoppNotice(null);

      const data = await api.getTour(selectedFahrer, datum);

      if (data?.tour) {
        setTour(data.tour);
        setStopps(Array.isArray(data.stopps) ? data.stopps : []);
        setNeuStopp(createEmptyStopp());
        setNotice({
          type: "success",
          text: `Die Tour für ${selectedDriverName} am ${formatDate(
            datum
          )} wurde geladen.`,
        });
      } else {
        clearOpenedTour();
        setNotice({
          type: "info",
          text: `Für ${selectedDriverName} am ${formatDate(
            datum
          )} ist noch keine Tour vorhanden. Sie können jetzt eine neue Tour anlegen.`,
        });
      }
    } catch (error) {
      console.error("Fehler beim Laden der Tour:", error);
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Die Tour konnte nicht geladen werden."),
      });
    } finally {
      setTourBusy("");
    }
  }

  async function anlegenTour() {
    if (!validateTourSelection() || isTourBusy || tour) return;

    try {
      setTourBusy("create");
      setNotice(null);
      setStoppNotice(null);

      // Vor dem Anlegen prüfen, ob bereits eine Tour existiert.
      // Dadurch entstehen bei einem versehentlichen zweiten Klick keine doppelten Touren.
      const existing = await api.getTour(selectedFahrer, datum);

      if (existing?.tour) {
        setTour(existing.tour);
        setStopps(Array.isArray(existing.stopps) ? existing.stopps : []);
        setNeuStopp(createEmptyStopp());
        setNotice({
          type: "info",
          text: `Für ${selectedDriverName} am ${formatDate(
            datum
          )} gab es bereits eine Tour. Sie wurde geöffnet, damit keine doppelte Tour entsteht.`,
        });
        return;
      }

      const createdTour = await api.createTour(selectedFahrer, datum);
      setTour(createdTour);
      setStopps([]);
      setNeuStopp(createEmptyStopp());
      setNotice({
        type: "success",
        text: `Die neue Tour für ${selectedDriverName} am ${formatDate(
          datum
        )} wurde angelegt.`,
      });
    } catch (error) {
      console.error("Fehler beim Anlegen der Tour:", error);
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Die Tour konnte nicht angelegt werden."),
      });
    } finally {
      setTourBusy("");
    }
  }

  // ---- STOPPS (nur hinzufügen; bestehende Stopps sind read-only) ----
  async function addStopp(event) {
    event.preventDefault();

    if (!tour?.id || stoppBusy) {
      setStoppNotice({
        type: "error",
        text: "Bitte öffnen Sie zuerst eine Tour.",
      });
      return;
    }

    const kunde = neuStopp.kunde.trim();
    const adresse = neuStopp.adresse.trim();

    if (!kunde || !adresse) {
      setStoppNotice({
        type: "error",
        text: "Bitte füllen Sie mindestens Kunde und Adresse aus.",
      });
      return;
    }

    let position = null;
    const positionText = String(neuStopp.position || "").trim();

    if (positionText) {
      const parsedPosition = Number(positionText);

      if (!Number.isFinite(parsedPosition)) {
        setStoppNotice({
          type: "error",
          text: "Die Position muss eine Zahl sein, zum Beispiel 1, 2 oder 3.",
        });
        return;
      }

      position = parsedPosition;
    }

    const payload = {
      kunde,
      adresse,
      telefon: neuStopp.telefon.trim(),
      kommission: neuStopp.kommission.trim(),
      hinweis: neuStopp.hinweis.trim(),
      position,
      ankunft: neuStopp.ankunft.trim(),
    };

    try {
      setStoppBusy(true);
      setStoppNotice(null);

      const createdStopp = await api.createStopp(tour.id, payload);
      setStopps((currentStopps) => [...currentStopps, createdStopp]);
      setNeuStopp(createEmptyStopp());
      setStoppNotice({
        type: "success",
        text: `Der Stopp „${createdStopp?.kunde || kunde}“ wurde hinzugefügt.`,
      });
    } catch (error) {
      console.error("Fehler beim Anlegen des Stopps:", error);
      setStoppNotice({
        type: "error",
        text: getErrorMessage(error, "Der Stopp konnte nicht angelegt werden."),
      });
    } finally {
      setStoppBusy(false);
    }
  }

  // ---- Fahrer verwalten (Modal) ----
  function openManage() {
    setNewDriverName("");
    setManageNotice(null);
    setShowManage(true);
  }

  function closeManage() {
    if (manageBusy) return;
    setShowManage(false);
  }

  async function modalAddFahrer(event) {
    event.preventDefault();

    const name = newDriverName.trim();
    if (!name || manageBusy) return;

    try {
      setManageBusy(true);
      setManageNotice(null);
      await api.addFahrer(name);
      setNewDriverName("");
      await ladeFahrer();
      setManageNotice({
        type: "success",
        text: `Der Fahrer „${name}“ wurde hinzugefügt.`,
      });
    } catch (error) {
      console.error("Fahrer hinzufügen fehlgeschlagen:", error);
      setManageNotice({
        type: "error",
        text: getErrorMessage(error, "Der Fahrer konnte nicht hinzugefügt werden."),
      });
    } finally {
      setManageBusy(false);
    }
  }

  async function modalDeleteFahrer(id, name) {
    const confirmed = window.confirm(`Fahrer „${name}“ wirklich löschen?`);
    if (!confirmed || manageBusy) return;

    try {
      setManageBusy(true);
      setManageNotice(null);
      await api.deleteFahrer(id);

      if (String(selectedFahrer) === String(id)) {
        setSelectedFahrer("");
        clearOpenedTour();
        setNotice(null);
      }

      await ladeFahrer();
      setManageNotice({
        type: "success",
        text: `Der Fahrer „${name}“ wurde gelöscht.`,
      });
    } catch (error) {
      console.error("Fahrer löschen fehlgeschlagen:", error);
      setManageNotice({
        type: "error",
        text: getErrorMessage(error, "Der Fahrer konnte nicht gelöscht werden."),
      });
    } finally {
      setManageBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#0058A3]">Tourenplanung</h1>

      <InlineNotice notice={notice} onClose={() => setNotice(null)} />

      <section className="space-y-5 bg-white p-4 shadow sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#0058A3]">Tour auswählen</h2>
            <p className="mt-1 text-sm leading-5 text-gray-600">
              Arbeiten Sie die vier Schritte der Reihe nach ab.
            </p>
          </div>

          <button
            type="button"
            onClick={openManage}
            disabled={fahrerLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0058A3] bg-white px-4 py-2.5 text-sm font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60 sm:w-auto"
          >
            <Settings size={18} aria-hidden="true" />
            Fahrer verwalten
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StepItem
            number="1"
            title="Fahrer"
            description="Fahrer auswählen"
            complete={Boolean(selectedFahrer)}
            active={!selectedFahrer}
          />
          <StepItem
            number="2"
            title="Datum"
            description="Tourtag festlegen"
            complete={Boolean(selectedFahrer && datum)}
            active={Boolean(selectedFahrer && !datum)}
          />
          <StepItem
            number="3"
            title="Tour öffnen"
            description="Laden oder anlegen"
            complete={Boolean(tour)}
            active={Boolean(hasTourSelection && !tour)}
          />
          <StepItem
            number="4"
            title="Stopps"
            description="Stopps erfassen"
            complete={Boolean(tour && stopps.length > 0)}
            active={Boolean(tour && stopps.length === 0)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F1FA] text-[#0058A3]">
                <UserRound size={19} aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">1. Fahrer auswählen</div>
                <div className="text-xs text-gray-500">Für wen wird die Tour geplant?</div>
              </div>
            </div>

            <label htmlFor="planung-fahrer" className="sr-only">
              Fahrer auswählen
            </label>
            <select
              id="planung-fahrer"
              className="w-full"
              value={selectedFahrer}
              onChange={handleFahrerChange}
              disabled={fahrerLoading || isTourBusy}
            >
              <option value="">
                {fahrerLoading ? "Fahrer werden geladen…" : "– Fahrer auswählen –"}
              </option>
              {fahrer.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>

            {!fahrerLoading && fahrer.length === 0 ? (
              <div className="mt-2 text-xs leading-5 text-amber-700">
                Es sind noch keine Fahrer vorhanden. Nutzen Sie „Fahrer verwalten“.
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F1FA] text-[#0058A3]">
                <CalendarDays size={19} aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">2. Datum auswählen</div>
                <div className="text-xs text-gray-500">An welchem Tag findet die Tour statt?</div>
              </div>
            </div>

            <label htmlFor="planung-datum" className="sr-only">
              Datum der Tour
            </label>
            <input
              id="planung-datum"
              type="date"
              className="w-full"
              value={datum}
              onChange={handleDatumChange}
              disabled={isTourBusy}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Truck size={19} className="text-[#0058A3]" aria-hidden="true" />
                3. Tour öffnen
              </div>
              <p className="mt-1 text-sm leading-5 text-gray-600">
                Laden Sie eine vorhandene Tour oder legen Sie eine neue Tour an.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <button
                type="button"
                onClick={ladeTour}
                disabled={!hasTourSelection || isTourBusy}
                className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-4 py-2.5 font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
              >
                {tourBusy === "load" ? (
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                ) : (
                  <ClipboardList size={18} aria-hidden="true" />
                )}
                {tourBusy === "load" ? "Tour wird geladen…" : "Tour laden"}
              </button>

              <button
                type="button"
                onClick={anlegenTour}
                disabled={!hasTourSelection || isTourBusy || Boolean(tour)}
                className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl border border-[#0058A3] bg-white px-4 py-2.5 font-semibold text-[#0058A3] transition hover:bg-[#E8F1FA] disabled:opacity-60"
              >
                {tourBusy === "create" ? (
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                ) : (
                  <Plus size={18} aria-hidden="true" />
                )}
                {tourBusy === "create" ? "Tour wird angelegt…" : "Neue Tour anlegen"}
              </button>
            </div>
          </div>

          {!hasTourSelection ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
              <Circle className="mt-1 shrink-0" size={10} fill="currentColor" aria-hidden="true" />
              Bitte zuerst Fahrer und Datum auswählen.
            </div>
          ) : null}
        </div>

        {tour ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <div className="text-base font-semibold text-green-900">Tour ist geöffnet</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-green-900">
                    <span className="font-medium">{selectedDriverName}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                    <span>{formatDate(tour.datum || datum)}</span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                      {stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-green-800">
                    Sie können jetzt unten weitere Stopps erfassen.
                  </p>
                </div>
              </div>

              <Link
                to="/tourverwaltung"
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-green-300 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 transition hover:bg-green-100 lg:w-auto"
              >
                Tour bearbeiten
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </div>

            <details className="mt-4 border-t border-green-200 pt-3 text-sm text-green-900">
              <summary className="cursor-pointer select-none font-medium">
                Technische Tourdaten anzeigen
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <span className="text-green-700">Tour-ID:</span>{" "}
                  <span className="font-semibold">{tour.id}</span>
                </div>
                <div>
                  <span className="text-green-700">Fahrer-ID:</span>{" "}
                  <span className="font-semibold">{tour.fahrer_id}</span>
                </div>
                <div>
                  <span className="text-green-700">Gespeichertes Datum:</span>{" "}
                  <span className="font-semibold">{String(tour.datum || datum)}</span>
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </section>

      {tour ? (
        <>
          <section className="space-y-5 bg-white p-4 shadow sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#0058A3]">
                  4. Neuen Stopp erfassen
                </h2>
                <p className="mt-1 text-sm leading-5 text-gray-600">
                  Kunde und Adresse sind Pflichtfelder. Alle weiteren Angaben sind optional.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-[#E8F1FA] px-3 py-1 text-xs font-semibold text-[#0058A3]">
                Tour: {selectedDriverName} · {formatDate(tour.datum || datum)}
              </span>
            </div>

            <form onSubmit={addStopp} className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <FormField id="planung-kunde" label="Kunde" required>
                  <input
                    id="planung-kunde"
                    type="text"
                    className="w-full"
                    placeholder="Name des Kunden"
                    value={neuStopp.kunde}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, kunde: event.target.value }))
                    }
                    disabled={stoppBusy}
                    required
                  />
                </FormField>

                <FormField id="planung-adresse" label="Adresse" required>
                  <input
                    id="planung-adresse"
                    type="text"
                    className="w-full"
                    placeholder="Straße, Hausnummer, PLZ und Ort"
                    value={neuStopp.adresse}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, adresse: event.target.value }))
                    }
                    disabled={stoppBusy}
                    required
                  />
                </FormField>

                <FormField id="planung-telefon" label="Telefon">
                  <input
                    id="planung-telefon"
                    type="tel"
                    className="w-full"
                    placeholder="Telefonnummer"
                    value={neuStopp.telefon}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, telefon: event.target.value }))
                    }
                    disabled={stoppBusy}
                  />
                </FormField>

                <FormField
                  id="planung-kommission"
                  label="Kommission"
                  help="Zum Beispiel Auftrag, Möbelstück oder Abholhinweis."
                >
                  <input
                    id="planung-kommission"
                    type="text"
                    className="w-full"
                    placeholder="Kommission oder Auftrag"
                    value={neuStopp.kommission}
                    onChange={(event) =>
                      setNeuStopp((current) => ({
                        ...current,
                        kommission: event.target.value,
                      }))
                    }
                    disabled={stoppBusy}
                  />
                </FormField>

                <FormField
                  id="planung-hinweis"
                  label="Hinweis"
                  className="lg:col-span-2"
                  help="Zusätzliche Informationen für Fertigung oder Fahrer."
                >
                  <textarea
                    id="planung-hinweis"
                    className="w-full resize-y"
                    rows={3}
                    placeholder="Zum Beispiel: Bitte vorher anrufen"
                    value={neuStopp.hinweis}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, hinweis: event.target.value }))
                    }
                    disabled={stoppBusy}
                  />
                </FormField>

                <FormField
                  id="planung-position"
                  label="Position"
                  help="Reihenfolge der Stopps, zum Beispiel 1, 2 oder 3."
                >
                  <input
                    id="planung-position"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    className="w-full"
                    placeholder="Zum Beispiel 1"
                    value={neuStopp.position}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, position: event.target.value }))
                    }
                    disabled={stoppBusy}
                  />
                </FormField>

                <FormField
                  id="planung-ankunft"
                  label="Ankunft"
                  help='Freie Eingabe, zum Beispiel „10:00 Uhr“ oder „ca. 11:30–12:00“.'
                >
                  <input
                    id="planung-ankunft"
                    type="text"
                    className="w-full"
                    placeholder="Geplante Ankunft"
                    value={neuStopp.ankunft}
                    onChange={(event) =>
                      setNeuStopp((current) => ({ ...current, ankunft: event.target.value }))
                    }
                    disabled={stoppBusy}
                  />
                </FormField>
              </div>

              <InlineNotice
                notice={stoppNotice}
                onClose={() => setStoppNotice(null)}
                compact
              />

              <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs leading-5 text-gray-500">
                  Bereits gespeicherte Stopps können in der Tourverwaltung bearbeitet oder
                  verschoben werden.
                </div>

                <button
                  type="submit"
                  disabled={stoppBusy}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-5 py-3 font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60 sm:w-auto"
                >
                  {stoppBusy ? (
                    <Loader2 className="animate-spin" size={19} aria-hidden="true" />
                  ) : (
                    <Plus size={19} aria-hidden="true" />
                  )}
                  {stoppBusy ? "Stopp wird gespeichert…" : "Stopp hinzufügen"}
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-4 bg-white p-4 shadow sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#0058A3]">Geplante Stopps</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Diese Liste zeigt alle derzeit gespeicherten Stopps der geöffneten Tour.
                </p>
              </div>

              <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">
                {stopps.length} {stopps.length === 1 ? "Stopp" : "Stopps"}
              </span>
            </div>

            {stopps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
                <Package className="mx-auto text-gray-400" size={32} aria-hidden="true" />
                <div className="mt-3 font-semibold text-gray-700">Noch keine Stopps vorhanden</div>
                <div className="mt-1 text-sm text-gray-500">
                  Erfassen Sie den ersten Stopp im Formular darüber.
                </div>
              </div>
            ) : (
              <>
                {/* Mobile Karten */}
                <div className="space-y-3 md:hidden">
                  {stopps.map((stopp, index) => (
                    <article
                      key={stopp.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Stopp {index + 1} · Position {stopp.position ?? "–"}
                          </div>
                          <div className="mt-1 break-words text-base font-semibold text-[#0058A3]">
                            {stopp.kunde || "Ohne Kundenname"}
                          </div>
                        </div>

                        {stopp.ankunft ? (
                          <span className="shrink-0 rounded-lg bg-[#E8F1FA] px-2.5 py-1 text-xs font-semibold text-[#0058A3]">
                            {stopp.ankunft}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-start gap-2.5">
                          <MapPin
                            className="mt-0.5 shrink-0 text-[#0058A3]"
                            size={17}
                            aria-hidden="true"
                          />
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
                          <Phone
                            className="mt-0.5 shrink-0 text-[#0058A3]"
                            size={17}
                            aria-hidden="true"
                          />
                          {stopp.telefon ? (
                            <a
                              className="font-medium text-blue-700 hover:underline"
                              href={telHref(stopp.telefon)}
                            >
                              {stopp.telefon}
                            </a>
                          ) : (
                            <span className="text-gray-500">Keine Telefonnummer</span>
                          )}
                        </div>

                        <div className="flex items-start gap-2.5">
                          <Package
                            className="mt-0.5 shrink-0 text-[#0058A3]"
                            size={17}
                            aria-hidden="true"
                          />
                          <span className="break-words">
                            {stopp.kommission || (
                              <span className="text-gray-500">Keine Kommission</span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <ClipboardList
                            className="mt-0.5 shrink-0 text-[#0058A3]"
                            size={17}
                            aria-hidden="true"
                          />
                          <span className="break-words">
                            {stopp.hinweis || (
                              <span className="text-gray-500">Kein Hinweis</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Desktop-Tabelle */}
                <div className="hidden overflow-x-auto rounded-xl border border-gray-200 md:block">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-[#0058A3] text-white">
                      <tr>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">Pos.</th>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">Kunde</th>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">Adresse</th>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">Telefon</th>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">
                          Kommission
                        </th>
                        <th className="border-r border-white/20 px-3 py-2.5 text-left">
                          Hinweis
                        </th>
                        <th className="px-3 py-2.5 text-left">Ankunft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stopps.map((stopp) => (
                        <tr key={stopp.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-center font-semibold text-gray-700">
                            {stopp.position ?? "–"}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">
                            {stopp.kunde || "–"}
                          </td>
                          <td className="max-w-[260px] px-3 py-2.5">
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
                          <td className="px-3 py-2.5">
                            {stopp.telefon ? (
                              <a
                                href={telHref(stopp.telefon)}
                                className="text-blue-700 hover:underline"
                              >
                                {stopp.telefon}
                              </a>
                            ) : (
                              "–"
                            )}
                          </td>
                          <td className="max-w-[240px] break-words px-3 py-2.5">
                            {stopp.kommission || "–"}
                          </td>
                          <td className="max-w-[280px] break-words px-3 py-2.5">
                            {stopp.hinweis || "–"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {stopp.ankunft || "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-gray-500">
                In der Planung werden vorhandene Stopps nur angezeigt. Änderungen erfolgen in
                der Tourverwaltung.
              </p>

              <Link
                to="/tourverwaltung"
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-200 sm:w-auto"
              >
                Zur Tourverwaltung
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </>
      ) : null}

      {/* Modal: Fahrer verwalten */}
      {showManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/45"
            onClick={closeManage}
            aria-label="Fahrerverwaltung schließen"
            tabIndex={-1}
          />

          <div
            className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-2.5rem)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fahrer-verwalten-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
              <div>
                <h3
                  id="fahrer-verwalten-title"
                  className="text-lg font-semibold text-[#0058A3]"
                >
                  Fahrer verwalten
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Neue Fahrer hinzufügen oder nicht mehr benötigte Fahrer löschen.
                </p>
              </div>

              <button
                type="button"
                onClick={closeManage}
                disabled={manageBusy}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition hover:bg-gray-200 disabled:opacity-60"
                aria-label="Schließen"
                title="Schließen"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <form
                onSubmit={modalAddFahrer}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <label
                  htmlFor="neuer-fahrer"
                  className="mb-1.5 block text-sm font-semibold text-gray-700"
                >
                  Neuen Fahrer hinzufügen
                </label>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="neuer-fahrer"
                    type="text"
                    className="min-w-0 flex-1"
                    placeholder="Vor- und Nachname"
                    value={newDriverName}
                    onChange={(event) => setNewDriverName(event.target.value)}
                    disabled={manageBusy}
                  />

                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0058A3] px-4 py-2.5 font-semibold text-white transition hover:bg-[#003F75] disabled:opacity-60"
                    disabled={manageBusy || !newDriverName.trim()}
                  >
                    {manageBusy ? (
                      <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                    ) : (
                      <Plus size={18} aria-hidden="true" />
                    )}
                    Hinzufügen
                  </button>
                </div>
              </form>

              <InlineNotice
                notice={manageNotice}
                onClose={() => setManageNotice(null)}
                compact
              />

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-800">Vorhandene Fahrer</div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                    {fahrer.length}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200">
                  {fahrerLoading ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500">
                      <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                      Fahrer werden geladen…
                    </div>
                  ) : fahrer.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-500">
                      Keine Fahrer vorhanden
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {fahrer.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F1FA] text-[#0058A3]">
                              <UserRound size={17} aria-hidden="true" />
                            </span>
                            <span className="truncate text-sm font-medium text-gray-900">
                              {entry.name}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                            onClick={() => modalDeleteFahrer(entry.id, entry.name)}
                            disabled={manageBusy}
                            title={`${entry.name} löschen`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            <span className="hidden sm:inline">Löschen</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-4 py-3 text-right sm:px-5">
              <button
                type="button"
                onClick={closeManage}
                className="inline-flex w-full items-center justify-center rounded-xl bg-gray-100 px-4 py-2.5 font-semibold text-gray-800 transition hover:bg-gray-200 disabled:opacity-60 sm:w-auto"
                disabled={manageBusy}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
