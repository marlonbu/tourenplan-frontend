// src/components/TagestourPdfButtons.jsx
import React, { useMemo, useState } from "react";
import { generateTagestourPDF } from "../utils/pdf/tagestourPdf";

/**
 * Props:
 * - logoDataUrl?: string
 * - mapUrl: string
 * - tour: { datum: string, fahrer_name: string, kwLabel?: string, bemerkung?: string }
 * - stopps: Array<{ position, ankunft, kunde, adresse, telefon, kommission, hinweis }>
 * - fileName?: string
 */
export default function TagestourPdfButtons({
  logoDataUrl = null,
  mapUrl = "",
  tour,
  stopps = [],
  fileName,
}) {
  const [busy, setBusy] = useState(false);

  const datumDE = useMemo(() => {
    if (tour?.datumDE) return tour.datumDE;
    try {
      return new Date(tour?.datum).toLocaleDateString("de-DE");
    } catch {
      return tour?.datum || "";
    }
  }, [tour]);

  const safeFileName =
    fileName ||
    `tagestour_${tour?.datum || ""}_${(tour?.fahrer_name || "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")}.pdf`;

  async function onCreatePdf() {
    try {
      setBusy(true);
      await generateTagestourPDF({
        title: "Tagestour – Übersicht",
        logoDataUrl,
        mapUrl,
        datumDE,
        fahrerName: tour?.fahrer_name || "",
        kwLabel: tour?.kwLabel || "",
        bemerkung: tour?.bemerkung || "",
        stopps,
        fileName: safeFileName,
      });
    } catch (e) {
      console.error(e);
      alert("PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  function openMap() {
    if (!mapUrl) return;
    window.open(mapUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="w-full flex items-center justify-center gap-3 my-2">
      <button
        type="button"
        onClick={openMap}
        className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
      >
        Tour in Google Maps öffnen
      </button>

      <button
        type="button"
        onClick={onCreatePdf}
        disabled={busy}
        className="px-4 py-2 rounded-md bg-[#0058A3] text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {busy ? "Erstelle PDF…" : "PDF erstellen"}
      </button>
    </div>
  );
}
