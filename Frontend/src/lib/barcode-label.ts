import { toSVG, type RenderOptions } from "bwip-js/browser";
import type { ItemApi } from "./master-types";

/** Simbologi yang didukung pada halaman /barcode. */
export type BarcodeKind = "Barcode" | "QR Code";

/** Ukuran label yang tersedia; "A4" = satu label penuh satu lembar. */
export type LabelSize = "30x20" | "50x30" | "100x50" | "A4";

export const LABEL_SIZES: { id: LabelSize; label: string }[] = [
  { id: "30x20", label: "30×20 mm" },
  { id: "50x30", label: "50×30 mm" },
  { id: "100x50", label: "100×50 mm" },
  { id: "A4", label: "A4 Penuh" },
];

/** Batas total label per cetak/unduh agar tidak salah print ratusan lembar. */
export const MAX_LABELS = 500;

/** Area A4 yang bisa dipakai (mm) dengan margin @page 10 mm. */
const SHEET_W_MM = 190;
const SHEET_H_MM = 277;

export type SheetLayout = {
  wMm: number;
  hMm: number;
  cols: number;
  rows: number;
  perSheet: number;
};

/** Geometri label per ukuran (mm) dan berapa banyak yang muat di satu lembar A4. */
export function computeSheetLayout(size: LabelSize): SheetLayout {
  let wMm: number;
  let hMm: number;
  switch (size) {
    case "30x20":
      wMm = 30;
      hMm = 20;
      break;
    case "50x30":
      wMm = 50;
      hMm = 30;
      break;
    case "100x50":
      wMm = 100;
      hMm = 50;
      break;
    case "A4":
      wMm = SHEET_W_MM;
      hMm = SHEET_H_MM;
      break;
  }
  const cols = Math.max(Math.floor(SHEET_W_MM / wMm), 1);
  const rows = Math.max(Math.floor(SHEET_H_MM / hMm), 1);
  return { wMm, hMm, cols, rows, perSheet: cols * rows };
}

/**
 * Nilai yang di-encode ke kode: barcode internal, lalu barcode produk,
 * lalu SKU sebagai fallback terakhir.
 */
export function encodeItem(item: Pick<ItemApi, "sku" | "barcode" | "internal_barcode">): string {
  return item.internal_barcode || item.barcode || item.sku;
}

/**
 * Bangun SVG kode (CODE128 untuk barcode, QR untuk QR Code) sebagai string.
 * Sinkron & SSR-safe (tidak menyentuh DOM). Melempar bila nilai kosong.
 */
export function buildCodeSvg(
  value: string,
  kind: BarcodeKind,
  opts?: { codeHeightMm?: number },
): string {
  const text = value.trim();
  if (!text) throw new Error("Nilai kode kosong — barang belum punya barcode/SKU");
  if (kind === "QR Code") {
    const qrOpts = { bcid: "qrcode", text, eclevel: "M" } as RenderOptions;
    return toSVG(qrOpts);
  }
  return toSVG({
    bcid: "code128",
    text,
    height: opts?.codeHeightMm ?? 14,
    includetext: true,
    textxalign: "center",
    textsize: 10,
    padding: 2,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
}

export type PrintLabel = {
  /** SVG kode yang sudah di-generate. */
  svg: string;
  name: string;
  /** Baris teks sekunder, mis. "SKU-10001-001 · Rp 125.000". */
  meta: string;
  kind: BarcodeKind;
  /** SKU barang — dipakai untuk nama file unduhan. */
  sku?: string;
};

export type PrintLabels = {
  size: LabelSize;
  labels: PrintLabel[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Dokumen HTML mandiri untuk print (hidden iframe): ukuran label dalam mm,
 * @page A4, baris teks nama + SKU/harga, warna kode dipertahankan.
 */
export function buildPrintHtml({ size, labels }: PrintLabels): string {
  const { wMm, hMm } = computeSheetLayout(size);
  const qrSideMm = Math.max(Math.min(wMm, hMm) - 8, 8);
  const items = labels
    .slice(0, MAX_LABELS)
    .map(
      (l) => `
      <div class="label ${l.kind === "QR Code" ? "qr" : "bars"}">
        <div class="code">${l.svg}</div>
        <div class="name">${escapeHtml(l.name)}</div>
        <div class="meta">${escapeHtml(l.meta)}</div>
      </div>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Cetak Label</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${wMm}mm; height: ${hMm}mm;
    display: inline-block; vertical-align: top;
    border: 0.2mm dashed #bbb; padding: 2mm;
    break-inside: avoid; page-break-inside: avoid;
    overflow: hidden;
  }
  .label .code { display: flex; justify-content: center; }
  .label.bars .code svg { display: block; width: 100%; height: auto; }
  .label.qr .code { align-items: center; }
  .label.qr .code svg { width: ${qrSideMm}mm; height: ${qrSideMm}mm; }
  .name { margin-top: 1mm; font-size: 9pt; font-weight: 700; line-height: 1.15; text-align: center; }
  .meta { margin-top: 0.5mm; font-size: 8pt; line-height: 1.2; text-align: center; color: #333; }
</style>
</head>
<body>
<div class="sheet">
${items}
</div>
</body>
</html>`;
}

const PX_PER_MM = 96 / 25.4;
/** Resolusi PNG 300 DPI untuk cetak tajam (96 DPI = 3.78 px/mm, 300 DPI = 11.81 px/mm). */
const PX_PER_MM_300 = 300 / 25.4;

/**
 * Satu file SVG berisi grid label dari lembar pertama (untuk unduh).
 * SVG bwip-js dinest ke dalam <svg> induk ber-sistem koordinat mm.
 * @deprecated Gunakan PNG/ZIP helpers di bawah untuk unduhan baru.
 */
export function buildSheetSvg({ size, labels }: PrintLabels): string {
  const { wMm, hMm, cols, perSheet } = computeSheetLayout(size);
  const page = labels.slice(0, perSheet);
  const W = Math.round(wMm * PX_PER_MM);
  const H = Math.round(hMm * PX_PER_MM);
  const children = page
    .map((l, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = Math.round(col * wMm * PX_PER_MM);
      const y = Math.round(row * hMm * PX_PER_MM);
      const inner = l.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      return `<svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${children}</svg>`;
}

/** Unduh string SVG sebagai file (klien-saja). @deprecated Gunakan downloadPng/downloadZip. */
export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// PNG & ZIP download (baru, dipakai halaman /barcode)
// ---------------------------------------------------------------------------

/** Amankan nama file dari karakter ilegal (/, :, dsb). */
export function slugFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "label";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Unduh Blob PNG sebagai file. */
export function downloadPng(blob: Blob, filename: string): void {
  downloadBlob(blob, filename.endsWith(".png") ? filename : `${filename}.png`);
}

/**
 * Render satu SVG string menjadi Blob PNG via <img> + <canvas> (client-only).
 * Resolusi mengikuti ukuran kanvas yang diminta.
 */
export function svgToPngBlob(svg: string, widthPx: number, heightPx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(widthPx));
      canvas.height = Math.max(1, Math.round(heightPx));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas tidak didukung"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (out) => {
          if (!out) reject(new Error("Gagal membuat PNG"));
          else resolve(out);
        },
        "image/png",
        1,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memuat SVG untuk konversi PNG"));
    };
    img.src = url;
  });
}

function labelCanvasSize(size: LabelSize): { wPx: number; hPx: number } {
  const { wMm, hMm } = computeSheetLayout(size);
  return {
    wPx: Math.max(1, Math.round(wMm * PX_PER_MM_300)),
    hPx: Math.max(1, Math.round(hMm * PX_PER_MM_300)),
  };
}

/**
 * Bangun PNG untuk satu label (kode + nama + meta) — layout mirip buildPrintHtml
 * tapi diraster menjadi bitmap 300 DPI. Mengembalikan Blob image/png.
 */
export async function renderLabelToPng(label: PrintLabel, size: LabelSize): Promise<Blob> {
  const { wMm, hMm } = computeSheetLayout(size);
  const { wPx, hPx } = labelCanvasSize(size);
  const qrSidePx = Math.max(Math.round(Math.min(wPx, hPx) - 8 * PX_PER_MM_300), Math.round(8 * PX_PER_MM_300));

  // Raster kode SVG menjadi canvas sementara
  const codeW = wPx - Math.round(4 * PX_PER_MM_300);
  const codeH =
    label.kind === "QR Code"
      ? qrSidePx
      : Math.round((size === "A4" ? 60 : size === "100x50" ? 22 : size === "50x30" ? 14 : 8) * PX_PER_MM_300);
  const codeBlob =
    label.kind === "QR Code"
      ? await svgToPngBlob(label.svg, qrSidePx, qrSidePx)
      : await svgToPngBlob(label.svg, codeW, codeH);

  const codeBitmap = await createImageBitmap(codeBlob);

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");

  // Background putih + border tipis
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.strokeStyle = "#bbbbbb";
  ctx.lineWidth = Math.max(1, Math.round(0.2 * PX_PER_MM_300));
  ctx.setLineDash([Math.round(2 * PX_PER_MM_300), Math.round(2 * PX_PER_MM_300)]);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, wPx - ctx.lineWidth, hPx - ctx.lineWidth);
  ctx.setLineDash([]);

  const pad = Math.round(2 * PX_PER_MM_300);
  let y = pad;

  if (label.kind === "QR Code") {
    const x = Math.round((wPx - qrSidePx) / 2);
    ctx.drawImage(codeBitmap, x, y, qrSidePx, qrSidePx);
    y += qrSidePx + Math.round(1 * PX_PER_MM_300);
  } else {
    const x = Math.round((wPx - codeW) / 2);
    ctx.drawImage(codeBitmap, x, y, codeW, codeH);
    y += codeH + Math.round(1 * PX_PER_MM_300);
  }
  codeBitmap.close?.();

  // Teks nama + meta (tengah)
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const nameSize = Math.round(9 * (300 / 72) * 0.35);
  ctx.font = `700 ${nameSize}px Arial, Helvetica, sans-serif`;
  const name = label.name.length > 28 ? `${label.name.slice(0, 28)}…` : label.name;
  ctx.fillText(name, wPx / 2, y, wPx - pad * 2);
  y += nameSize + Math.round(0.5 * PX_PER_MM_300);
  const metaSize = Math.round(8 * (300 / 72) * 0.32);
  ctx.font = `${metaSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#333333";
  ctx.fillText(label.meta, wPx / 2, y, wPx - pad * 2);
  void wMm;
  void hMm;

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat PNG label"))), "image/png", 1);
  });
}

/**
 * Download: 1 label → 1 PNG, >1 label → ZIP berisi N PNG (satu per instance).
 * Nama di dalam ZIP: label-<slugSku>-<index>.png (deduplikasi bila SKU sama).
 */
export async function downloadLabelsAsPngOrZip(labels: PrintLabel[], size: LabelSize): Promise<string> {
  const capped = labels.slice(0, MAX_LABELS);
  if (capped.length === 0) throw new Error("Tidak ada label untuk diunduh");
  if (capped.length === 1) {
    const l = capped[0]!;
    const blob = await renderLabelToPng(l, size);
    const base = l.sku ? slugFilename(l.sku) : slugFilename(l.name);
    const filename = `label-${base}.png`;
    downloadPng(blob, filename);
    return filename;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const counts = new Map<string, number>();
  for (const l of capped) {
    const blob = await renderLabelToPng(l, size);
    const base = l.sku ? slugFilename(l.sku) : slugFilename(l.name);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const entryName = `${slugFilename(`label-${base}`)}-${String(n).padStart(3, "0")}.png`;
    zip.file(entryName, blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const zipName = `label-${size}.zip`;
  downloadBlob(zipBlob, zipName);
  return zipName;
}

/** Cetak dokumen HTML lewat iframe tersembunyi (anti popup-blocker). */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  win.focus();
  const cleanup = () => frame.remove();
  win.onafterprint = cleanup;
  setTimeout(() => {
    win.print();
    setTimeout(cleanup, 2000);
  }, 150);
}
