// src/utils/pdf/tagestourPdf.js
// Erzeugt ein A4-Querformat-PDF für die Tagestour
// Abhängigkeiten: jspdf, jspdf-autotable, qrcode

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

/**
 * generateTagestourPDF
 * @param {Object} opts
 * @param {string}  opts.title                - Titel im Header (z.B. "Tagestour – Übersicht")
 * @param {string}  opts.logoDataUrl         - optional: DataURL des Logos (PNG/JPG)
 * @param {string}  opts.mapUrl              - URL für den QR-Code
 * @param {string}  opts.datumDE             - Datum "de-DE"
 * @param {string}  opts.fahrerName          - Fahrer-Name
 * @param {string}  opts.kwLabel             - z.B. "KW 47" (optional)
 * @param {string}  opts.bemerkung           - Bemerkungstext
 * @param {Array}   opts.stopps              - [{position, ankunft, kunde, adresse, telefon, kommission, hinweis}]
 * @param {string}  opts.fileName            - Dateiname der PDF
 */
export async function generateTagestourPDF(opts = {}) {
  const {
    title = "Tagestour – Übersicht",
    logoDataUrl = null,
    mapUrl = "",
    datumDE = "",
    fahrerName = "",
    kwLabel = "",
    bemerkung = "",
    stopps = [],
    fileName = "tagestour.pdf",
  } = opts;

  // A4 Querformat
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36; // 0,5 inch
  const lineH = 18;

  // Farben
  const gehBlue = [0, 88, 163];
  const bannerBg = [232, 241, 250];
  const textGray = [60, 60, 60];

  // ---------- HEADER-BANNER ----------
  const bannerHeight = 110;
  doc.setFillColor(...bannerBg);
  doc.rect(0, 0, pageWidth, bannerHeight, "F");

  // Titel links im Banner
  doc.setTextColor(...gehBlue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, marginX, 40);

  // optionales Logo klein links oben
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", marginX, 14, 70, 24);
    } catch {}
  }

  // QR-Code rechts im Banner
  let qrDataUrl = "";
  if (mapUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(mapUrl, { margin: 1, scale: 6 });
    } catch {}
  }
  const qrSize = 96;
  const qrX = pageWidth - marginX - qrSize;
  const qrY = 10;
  if (qrDataUrl) doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Label unter QR (im Banner)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(50);
  const qrLabel = "Tour in Google Maps öffnen";
  const labelW = doc.getTextWidth(qrLabel);
  doc.text(qrLabel, qrX + (qrSize - labelW) / 2, qrY + qrSize + 18);

  // ---------- META-BLOCK (unterhalb Banner) ----------
  let y = bannerHeight + 16;
  doc.setTextColor(...textGray);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);

  const metaLeftX = marginX;
  const metaGapY = lineH + 4;

  // Datum
  doc.text("Datum:", metaLeftX, y);
  doc.setFont("helvetica", "normal");
  doc.text(datumDE || "—", metaLeftX + 80, y);

  // Fahrer
  y += metaGapY;
  doc.setFont("helvetica", "bold");
  doc.text("Fahrer:", metaLeftX, y);
  doc.setFont("helvetica", "normal");
  doc.text(fahrerName || "—", metaLeftX + 80, y);

  // KW (optional)
  if (kwLabel) {
    y += metaGapY;
    doc.setFont("helvetica", "bold");
    doc.text("Kalenderwoche:", metaLeftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(kwLabel, metaLeftX + 140, y);
  }

  // Bemerkung
  y += metaGapY;
  doc.setFont("helvetica", "bold");
  doc.text("Bemerkung:", metaLeftX, y);
  doc.setFont("helvetica", "normal");

  const remarkMaxWidth = pageWidth * 0.7;
  const remarkLines = doc.splitTextToSize(bemerkung || "—", remarkMaxWidth);
  doc.text(remarkLines, metaLeftX + 100, y);

  // Tabellenstart dicht unter dem Meta-Block
  const tableStartY = y + lineH * Math.max(1, remarkLines.length) + 14;

  // ---------- TABELLE ----------
  const columns = [
    { header: "Pos", dataKey: "position" },
    { header: "Ankunft", dataKey: "ankunft" },
    { header: "Kunde", dataKey: "kunde" },
    { header: "Adresse", dataKey: "adresse" },
    { header: "Telefon", dataKey: "telefon" },
    { header: "Kommission", dataKey: "kommission" },
    { header: "Hinweis", dataKey: "hinweis" },
  ];

  const rows = (stopps || []).map((s) => ({
    position: Number.isFinite(s.position) ? String(s.position) : "",
    ankunft: s.ankunft || "",
    kunde: s.kunde || "",
    adresse: s.adresse || "",
    telefon: s.telefon || "",
    kommission: s.kommission || "",
    hinweis: s.hinweis || "",
  }));

  autoTable(doc, {
    startY: tableStartY,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => r[c.dataKey] ?? "")),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 11.5,
      cellPadding: 6,
      overflow: "linebreak",
      lineColor: [220, 220, 220],
      lineWidth: 0.6,
      valign: "top"
    },
    headStyles: {
      fillColor: gehBlue,
      textColor: 255,
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [40, 40, 40]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 36, halign: "center" }, // Pos
      1: { cellWidth: 68 },                   // Ankunft
      2: { cellWidth: 160 },                  // Kunde
      3: { cellWidth: 250 },                  // Adresse
      4: { cellWidth: 120 },                  // Telefon
      5: { cellWidth: 120 },                  // Kommission
      6: { cellWidth: 190 },                  // Hinweis
    },
    didDrawPage: () => {
      const foot = `Erstellt am ${new Date().toLocaleString("de-DE")}`;
      doc.setFontSize(9.5);
      doc.setTextColor(130);
      doc.text(foot, marginX, pageHeight - 16);
    },
  });

  doc.save(fileName || "tagestour.pdf");
}
