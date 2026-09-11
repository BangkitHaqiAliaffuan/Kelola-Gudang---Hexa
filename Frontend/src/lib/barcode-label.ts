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

/** Kertas A4 penuh (mm) — area cetak = kertas − 2 × margin. */
const PAPER_W_MM = 210;
const PAPER_H_MM = 297;

/** Batas bawah dimensi label (mm) agar CODE128 + quiet zone tetap terbaca
 *  scanner murah. Usulan — perlu persetujuan pembimbing (lihat plan). */
export const MIN_LABEL_MM = 15;

/**
 * Parse teks field angka grid template. null = belum valid (mis. field
 * dikosongkan saat mengetik) — pemanggil mempertahankan teks dan tidak
 * commit ke draft, sehingga digit pertama/tunggal pun bisa dihapus/diketik
 * ulang lewat keyboard. Rentang nilai (1–20, 0–5, ...) divalidasi terpisah
 * oleh validateTemplate agar pesan kesalahan tetap muncul di UI.
 */
export function parseGridNumber(raw: string, integer: boolean): number | null {
  const s = raw.trim();
  if (s === "") return null;
  if (integer && !/^-?\d+$/.test(s)) return null;
  const v = integer ? Number.parseInt(s, 10) : Number(s);
  return Number.isFinite(v) ? v : null;
}

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
 * Template layout label: preset standar (geometri legacy tetap) atau custom
 * operator (dimensi dihitung fill-width agar pas kertas).
 * Custom tersimpan di localStorage "kg-label-templates" (lihat use-label-templates).
 */
export type LabelTemplate = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  marginMm: number;
  gapMm: number;
  showName: boolean;
  showMeta: boolean;
  /** Diisi hanya untuk preset — geometri legacy yang tidak boleh bergeser. */
  labelWMm?: number;
  labelHMm?: number;
};

/** Preset ekuivalen 1:1 dengan LabelSize lama (lihat computeSheetLayout). */
export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: "std-30x20",
    name: "30×20 mm",
    cols: 6,
    rows: 13,
    marginMm: 10,
    gapMm: 0,
    showName: true,
    showMeta: true,
    labelWMm: 30,
    labelHMm: 20,
  },
  {
    id: "std-50x30",
    name: "50×30 mm",
    cols: 3,
    rows: 9,
    marginMm: 10,
    gapMm: 0,
    showName: true,
    showMeta: true,
    labelWMm: 50,
    labelHMm: 30,
  },
  {
    id: "std-100x50",
    name: "100×50 mm",
    cols: 1,
    rows: 5,
    marginMm: 10,
    gapMm: 0,
    showName: true,
    showMeta: true,
    labelWMm: 100,
    labelHMm: 50,
  },
  {
    id: "std-a4",
    name: "A4 Penuh",
    cols: 1,
    rows: 1,
    marginMm: 10,
    gapMm: 0,
    showName: true,
    showMeta: true,
    labelWMm: SHEET_W_MM,
    labelHMm: SHEET_H_MM,
  },
];

const TEMPLATE_FOR_SIZE: Record<LabelSize, string> = {
  "30x20": "std-30x20",
  "50x30": "std-50x30",
  "100x50": "std-100x50",
  A4: "std-a4",
};

/** Preset ekuivalen sebuah LabelSize lama (untuk kompatibilitas pemanggil lama). */
export function presetForSize(size: LabelSize): LabelTemplate {
  return LABEL_TEMPLATES.find((t) => t.id === TEMPLATE_FOR_SIZE[size])!;
}

export type TemplateDims = SheetLayout & { marginMm: number; gapMm: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dimensi final sebuah template. Preset memakai geometri legacy tetap;
 *  custom menghitung fill-width dari margin + gap. */
export function templateDims(t: LabelTemplate): TemplateDims {
  if (t.labelWMm != null && t.labelHMm != null) {
    return {
      wMm: t.labelWMm,
      hMm: t.labelHMm,
      cols: t.cols,
      rows: t.rows,
      perSheet: t.cols * t.rows,
      marginMm: t.marginMm,
      gapMm: t.gapMm,
    };
  }
  const printW = PAPER_W_MM - 2 * t.marginMm;
  const printH = PAPER_H_MM - 2 * t.marginMm;
  return {
    wMm: round2((printW - t.gapMm * (t.cols - 1)) / t.cols),
    hMm: round2((printH - t.gapMm * (t.rows - 1)) / t.rows),
    cols: t.cols,
    rows: t.rows,
    perSheet: t.cols * t.rows,
    marginMm: t.marginMm,
    gapMm: t.gapMm,
  };
}

/** Validasi template custom. null = valid, string = pesan kesalahan (id). */
export function validateTemplate(
  t: Pick<LabelTemplate, "cols" | "rows" | "marginMm" | "gapMm" | "name">,
): string | null {
  if (!Number.isInteger(t.cols) || t.cols < 1 || t.cols > 20)
    return "Kolom harus bilangan bulat 1–20";
  if (!Number.isInteger(t.rows) || t.rows < 1 || t.rows > 30)
    return "Baris harus bilangan bulat 1–30";
  if (!(t.marginMm >= 0) || t.marginMm > 20) return "Margin harus 0–20 mm";
  if (!(t.gapMm >= 0) || t.gapMm > 5) return "Jarak antar label harus 0–5 mm";
  if (!t.name.trim() || t.name.trim().length > 40) return "Nama template 1–40 karakter";
  const d = templateDims({ ...t, id: "", showName: true, showMeta: true });
  if (d.wMm < MIN_LABEL_MM || d.hMm < MIN_LABEL_MM)
    return `Label hasil ${d.wMm}×${d.hMm} mm — terlalu kecil (minimal ${MIN_LABEL_MM} mm agar barcode terbaca)`;
  return null;
}

/** Tinggi bar CODE128 (mm). Preset memakai nilai legacy; custom proporsional. */
export function codeHeightForTemplate(t: LabelTemplate): number {
  switch (t.id) {
    case "std-30x20":
      return 8;
    case "std-50x30":
      return 14;
    case "std-100x50":
      return 22;
    case "std-a4":
      return 60;
    default: {
      const { hMm } = templateDims(t);
      return Math.min(Math.max(Math.round(hMm * 0.45), 6), 60);
    }
  }
}

/** Sisi QR (mm) = sisi terpendek label − 8. Peringatan bila ≤ 12 (≈30×20). */
export function qrSideForTemplate(t: LabelTemplate): number {
  const { wMm, hMm } = templateDims(t);
  return Math.max(Math.min(wMm, hMm) - 8, 8);
}

/**
 * Nilai yang di-encode ke kode: barcode internal, lalu barcode produk,
 * lalu SKU sebagai fallback terakhir.
 */
export function encodeItem(item: Pick<ItemApi, "sku" | "barcode" | "internal_barcode">): string {
  return item.internal_barcode || item.barcode || item.sku;
}

/** Sumber nilai eksplisit untuk cetak — operator memilih, tanpa prioritas diam-diam. */
export type CodeSource = "internal" | "produk" | "sku";

export const CODE_SOURCE_LABEL: Record<CodeSource, string> = {
  internal: "Barcode Internal",
  produk: "Barcode Produk",
  sku: "SKU",
};

/**
 * Nilai yang di-encode sesuai pilihan operator. Mengembalikan "" bila kolom
 * kosong — pemanggil menampilkan empty-state jujur seperti biasa.
 */
export function encodeItemWithSource(
  item: Pick<ItemApi, "sku" | "barcode" | "internal_barcode">,
  source: CodeSource,
): string {
  if (source === "internal") return item.internal_barcode ?? "";
  if (source === "produk") return item.barcode ?? "";
  return item.sku;
}

/** Normalisasi untuk matching scan: trim + buang \r\n + lower-case. */
export function normalizeCode(s: string): string {
  return s
    .trim()
    .replace(/[\r\n]/g, "")
    .toLowerCase();
}

/**
 * Cek digit EAN-13/EAN-8/UPC-A (UPC-A = EAN-13 berawalan 0).
 * @returns true bila valid, false bila digit cek salah, null bila bukan
 * panjang EAN (tidak perlu diperingatkan — mis. CODE128 internal).
 */
export function eanChecksumOk(code: string): boolean | null {
  const digits = code.trim();
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 13) return null;
  const nums = digits.split("").map(Number);
  const check = nums[nums.length - 1]!;
  // Aturan GS1: dari kanan (tanpa digit cek), bobot 3,1,3,1...
  const body = nums.slice(0, -1).reverse();
  let sum = 0;
  body.forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** Cari ItemApi yang kodenya cocok dengan hasil scan (internal/barcode/sku). */
export function findItemByCode<
  T extends Pick<ItemApi, "id" | "sku" | "barcode" | "internal_barcode">,
>(items: T[], code: string): T | undefined {
  return findMatchesByCode(items, code)[0]?.item;
}

/** Asal kecocokan scan — menentukan label sumber + prioritas. */
export type MatchSource = "internal" | "produk" | "sku";

export const MATCH_SOURCE_LABEL: Record<MatchSource, string> = {
  internal: "label internal",
  produk: "kemasan supplier",
  sku: "SKU",
};

const SOURCE_RANK: Record<MatchSource, number> = { internal: 0, produk: 1, sku: 2 };

/** Tentukan asal kecocokan satu barang terhadap kode scan (null bila tak cocok). */
export function matchSourceOf(
  item: Pick<ItemApi, "sku" | "barcode" | "internal_barcode">,
  code: string,
): MatchSource | null {
  const c = normalizeCode(code);
  if (!c) return null;
  if (normalizeCode(item.internal_barcode ?? "") === c) return "internal";
  if (normalizeCode(item.barcode ?? "") === c) return "produk";
  if (normalizeCode(item.sku) === c) return "sku";
  return null;
}

/**
 * Semua barang yang cocok dengan hasil scan, terurut prioritas
 * (internal → produk → SKU). Barcode kemasan supplier boleh dipakai banyak
 * barang — pemanggil wajib menampilkan dialog disambiguasi bila >1.
 */
export function findMatchesByCode<
  T extends Pick<ItemApi, "id" | "sku" | "barcode" | "internal_barcode">,
>(items: T[], code: string): { item: T; source: MatchSource }[] {
  const out: { item: T; source: MatchSource }[] = [];
  for (const it of items) {
    const source = matchSourceOf(it, code);
    if (source) out.push({ item: it, source });
  }
  out.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
  return out;
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
    scale: 2,
    height: opts?.codeHeightMm ?? 10,
    includetext: true,
    textxalign: "center",
    textsize: 10,
    padding: 10,
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

export type PrintLabels =
  { size: LabelSize; labels: PrintLabel[] } | { template: LabelTemplate; labels: PrintLabel[] };

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
 *
 * Layout memakai grid kolom tetap per ukuran + wrapper `.page` per lembar
 * (break-after terkontrol) sehingga susunan halaman dapat diprediksi.
 * Border dashed hanya panduan potong di layar — disembunyikan saat print.
 * String HTML ini juga dipakai untuk preview WYSIWYG di halaman /barcode:
 * satu sumber kebenaran untuk layar dan cetakan.
 */
export function buildPrintHtml(input: PrintLabels): string {
  const template = "template" in input ? input.template : presetForSize(input.size);
  const labels = input.labels;
  const { wMm, hMm, cols, perSheet, marginMm, gapMm } = templateDims(template);
  const qrSideMm = qrSideForTemplate(template);
  const capped = labels.slice(0, MAX_LABELS);
  const renderLabel = (l: PrintLabel) => `
      <div class="label ${l.kind === "QR Code" ? "qr" : "bars"}">
        <div class="code">${l.svg}</div>${
          template.showName
            ? `
        <div class="name">${escapeHtml(l.name)}</div>`
            : ""
        }${
          template.showMeta
            ? `
        <div class="meta">${escapeHtml(l.meta)}</div>`
            : ""
        }
      </div>`;
  const pages: string[] = [];
  for (let p = 0; p * perSheet < capped.length; p++) {
    const pageLabels = capped.slice(p * perSheet, (p + 1) * perSheet);
    const last = (p + 1) * perSheet >= capped.length;
    pages.push(
      `    <div class="page${last ? "" : " break"}">\n${pageLabels.map(renderLabel).join("\n")}\n    </div>`,
    );
  }
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Cetak Label</title>
<style>
  @page { size: A4 portrait; margin: ${marginMm}mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    display: grid; grid-template-columns: repeat(${cols}, ${wMm}mm);${
      gapMm > 0
        ? `
    gap: ${gapMm}mm;`
        : ""
    }
    justify-content: start;
  }
  .page.break { break-after: page; page-break-after: always; }
  .label {
    width: ${wMm}mm; height: ${hMm}mm;
    border: 0.2mm dashed #bbb; padding: 2mm;
    break-inside: avoid; page-break-inside: avoid;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  @media print { .label { border: none; } }
  /* Area kode fleksibel dengan batas tegas: SVG mengecil mengikuti ruang
     (keputusan: teks nama/meta tidak boleh terpotong), bukan mendorong teks
     keluar kotak. Ukuran intrinsik dari codeHeightForTemplate dipertahankan
     sehingga penyusutan hanya terjadi bila kalau tidak teks terpotong. */
  .label .code { display: flex; justify-content: center; align-items: center;
    flex: 1 1 auto; min-height: 0; min-width: 0; }
  .label.bars .code svg { display: block; width: auto; height: auto;
    max-width: 100%; max-height: 100%; }
  .label.qr .code svg { width: ${qrSideMm}mm; height: ${qrSideMm}mm;
    max-width: 100%; max-height: 100%; }
  .name { flex: none; margin-top: 1mm; font-size: 9pt; font-weight: 700; line-height: 1.15; text-align: center; }
  .meta { flex: none; margin-top: 0.5mm; font-size: 8pt; line-height: 1.2; text-align: center; color: #333; }
</style>
</head>
<body>
<div class="sheet">
${pages.join("\n")}
</div>
</body>
</html>`;
}

/**
 * Varian preview-layar dari dokumen print: baris-baris label direnggangkan
 * vertikal mengisi penuh tinggi section preview (iframe sandbox di /barcode).
 * HANYA untuk `srcDoc` preview — builder cetak (`buildPrintHtml`) dan helper
 * unduhan tidak tersentuh sehingga hasil printer tetap sesuai ukuran mm.
 * Ukuran tiap label tidak diubah (tetap mm via `.label`); yang berubah hanya
 * distribusi ruang kosong antar baris grid (satu baris tetap di atas,
 * persis posisi cetak).
 */
export function withPreviewStretch(printHtml: string): string {
  const style = [
    "<style>",
    "html, body { height: 100%; }",
    ".sheet { min-height: 100%; }",
    ".page { min-height: 100%; align-content: space-between; }",
    "</style>",
  ].join("");
  return printHtml.replace("</head>", `${style}</head>`);
}

const PX_PER_MM = 96 / 25.4;
/** Resolusi PNG 300 DPI untuk cetak tajam (96 DPI = 3.78 px/mm, 300 DPI = 11.81 px/mm). */
const PX_PER_MM_300 = 300 / 25.4;

/**
 * Satu file SVG berisi grid label dari lembar pertama (untuk unduh).
 * SVG bwip-js dinest ke dalam <svg> induk ber-sistem koordinat mm.
 * @deprecated Gunakan PNG/ZIP helpers di bawah untuk unduhan baru.
 */
export function buildSheetSvg({ size, labels }: { size: LabelSize; labels: PrintLabel[] }): string {
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
  return (
    s
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "label"
  );
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
 * Ukuran natural SVG dari atribut viewBox (bwip-js hanya menulis viewBox
 * tanpa width/height, sehingga naturalWidth browser tidak dapat diandalkan).
 */
export function svgNaturalSize(svg: string): { w: number; h: number } | null {
  const m = svg.match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

/**
 * Render satu SVG string menjadi Blob PNG via <img> + <canvas> (client-only).
 * Resolusi mengikuti ukuran kanvas yang diminta.
 * - fit "stretch" (default): gambar dipaksa mengisi penuh kanvas (perilaku lama).
 * - fit "contain": aspek natural (dari viewBox) dikunci, gambar di tengah di
 *   atas background putih — untuk barcode agar bars tidak gepeng/melebar.
 */
export function svgToPngBlob(
  svg: string,
  widthPx: number,
  heightPx: number,
  opts?: { fit?: "stretch" | "contain" },
): Promise<Blob> {
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
      if (opts?.fit === "contain") {
        const nat = svgNaturalSize(svg) ?? { w: img.naturalWidth, h: img.naturalHeight };
        if (nat.w > 0 && nat.h > 0) {
          const scale = Math.min(canvas.width / nat.w, canvas.height / nat.h);
          const dw = nat.w * scale;
          const dh = nat.h * scale;
          ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } else {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
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

/** Konteks minimal untuk fitText (Canvas asli maupun mock test). */
export type TextMeasurer = {
  font: string;
  measureText: (text: string) => { width: number };
};

/**
 * Sesuaikan teks agar muat dalam maxWidth TANPA memampatkan horizontal
 * (param maxWidth fillText justru membuat huruf gepeng).
 * Strategi: kecilkan font sampai muat (batas minRatio dari ukuran awal),
 * terakhir potong + ellipsis. Mengembalikan font & teks final (font juga
 * sudah dipasang ke ctx).
 */
export function fitText(
  ctx: TextMeasurer,
  text: string,
  opts: {
    weight?: string;
    family?: string;
    startSize: number;
    maxWidth: number;
    minRatio?: number;
  },
): { font: string; size: number; text: string } {
  const weight = opts.weight ?? "";
  const family = opts.family ?? "Arial, Helvetica, sans-serif";
  const min = Math.max(1, Math.floor(opts.startSize * (opts.minRatio ?? 0.6)));
  let size = opts.startSize;
  const apply = (s: number) => {
    ctx.font = `${weight ? `${weight} ` : ""}${s}px ${family}`;
  };
  apply(size);
  while (size > min && ctx.measureText(text).width > opts.maxWidth) {
    size -= 1;
    apply(size);
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > opts.maxWidth) {
    out = `${out.slice(0, -2)}…`;
  }
  return { font: ctx.font, size, text: out };
}

function labelCanvasSize(input: LabelSize | LabelTemplate): { wPx: number; hPx: number } {
  const { wMm, hMm } =
    typeof input === "string" ? templateDims(presetForSize(input)) : templateDims(input);
  return {
    wPx: Math.max(1, Math.round(wMm * PX_PER_MM_300)),
    hPx: Math.max(1, Math.round(hMm * PX_PER_MM_300)),
  };
}

/**
 * Bangun PNG untuk satu label (kode + nama + meta) — layout mirip buildPrintHtml
 * tapi diraster menjadi bitmap 300 DPI. Mengembalikan Blob image/png.
 */
export async function renderLabelToPng(
  label: PrintLabel,
  input: LabelSize | LabelTemplate,
): Promise<Blob> {
  const template = typeof input === "string" ? presetForSize(input) : input;
  const { wPx, hPx } = labelCanvasSize(template);
  const qrSideMm = qrSideForTemplate(template);
  const qrSidePx = Math.max(Math.round(qrSideMm * PX_PER_MM_300), Math.round(8 * PX_PER_MM_300));

  // Raster kode SVG menjadi canvas sementara — contain agar aspek barcode
  // dikunci (bars tidak gepeng); sisa slot menjadi margin putih simetris.
  const codeW = wPx - Math.round(4 * PX_PER_MM_300);
  const codeH =
    label.kind === "QR Code"
      ? qrSidePx
      : Math.round(codeHeightForTemplate(template) * PX_PER_MM_300);
  const codeBlob =
    label.kind === "QR Code"
      ? await svgToPngBlob(label.svg, qrSidePx, qrSidePx, { fit: "contain" })
      : await svgToPngBlob(label.svg, codeW, codeH, { fit: "contain" });

  const codeBitmap = await createImageBitmap(codeBlob);

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");

  // Background putih tanpa border — hasil PNG identik dengan cetakan
  // (border panduan potong hanya tampil di preview layar).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wPx, hPx);

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

  // Teks nama + meta (tengah) — mengikuti toggle template.
  // Ukuran font mengecil otomatis agar muat (fitText); tidak pernah
  // dimampatkan horizontal via maxWidth agar huruf tidak gepeng.
  if (template.showName) {
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const nameSize = Math.round(9 * (300 / 72) * 0.35);
    const fitted = fitText(ctx, label.name, {
      weight: "700",
      startSize: nameSize,
      maxWidth: wPx - pad * 2,
    });
    ctx.fillText(fitted.text, wPx / 2, y);
    y += fitted.size + Math.round(0.5 * PX_PER_MM_300);
  }
  if (template.showMeta) {
    ctx.fillStyle = "#333333";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const metaSize = Math.round(8 * (300 / 72) * 0.32);
    const fitted = fitText(ctx, label.meta, {
      startSize: metaSize,
      maxWidth: wPx - pad * 2,
    });
    ctx.fillText(fitted.text, wPx / 2, y);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gagal membuat PNG label"))),
      "image/png",
      1,
    );
  });
}

/**
 * Download: 1 label → 1 PNG, >1 label → ZIP berisi N PNG (satu per instance).
 * Nama di dalam ZIP: label-<slugSku>-<index>.png (deduplikasi bila SKU sama).
 */
export async function downloadLabelsAsPngOrZip(
  labels: PrintLabel[],
  input: LabelSize | LabelTemplate,
): Promise<string> {
  const template = typeof input === "string" ? presetForSize(input) : input;
  const capped = labels.slice(0, MAX_LABELS);
  if (capped.length === 0) throw new Error("Tidak ada label untuk diunduh");
  if (capped.length === 1) {
    const l = capped[0]!;
    const blob = await renderLabelToPng(l, template);
    const base = l.sku ? slugFilename(l.sku) : slugFilename(l.name);
    const filename = `label-${base}.png`;
    downloadPng(blob, filename);
    return filename;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const counts = new Map<string, number>();
  for (const l of capped) {
    const blob = await renderLabelToPng(l, template);
    const base = l.sku ? slugFilename(l.sku) : slugFilename(l.name);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const entryName = `${slugFilename(`label-${base}`)}-${String(n).padStart(3, "0")}.png`;
    zip.file(entryName, blob);
  }
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const zipName = `label-${template.id}.zip`;
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
