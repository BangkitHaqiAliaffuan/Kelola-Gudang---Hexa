/**
 * Helper murni untuk dialog bulk-import barang (tanpa dependensi React).
 * Dipisah ke modul ini agar dapat diuji unit langsung (lihat
 * `import-parse.spec.ts`) tanpa me-render dialog.
 */

/** Kolom angka: "money" (cost/price), "int" (min/max/lead), "weight". */
export type ImportNumberKind = "money" | "int" | "weight";

export type ImportAutoCreateField = "autoCreateCat" | "autoCreateMerk" | "autoCreateUnit";

export type ImportAutoCreateEntry = {
  name: string;
  checked: boolean;
};

export type ImportRowStatus = "valid" | "error" | "auto_create" | "skipped";

/**
 * Parse angka gaya Indonesia: "50.000"/"50 000" ribuan, "0,5"/"0.5" desimal.
 * Aturan ambiguitas: satu pemisah + tepat 3 digit ekor ("1.234") dibaca
 * ribuan untuk money/int dan desimal untuk weight.
 */
export function parseLocalizedNumber(
  val: string | undefined,
  kind: ImportNumberKind = "money",
): number | null {
  if (!val?.trim()) return null;
  let s = val.trim().replace(/[\s_']/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Pemisah terakhir adalah desimal ("1.234.567,89" / "1,234.56").
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    // Koma + 1-2 digit ekor = desimal ("1,5"); selain itu ribuan ("1,234").
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      s = parts.join("");
    } else if (parts.length === 2 && /^\d{3}$/.test(parts[1] ?? "")) {
      const head = parts[0] ?? "";
      const tail = parts[1] ?? "";
      s = kind === "weight" ? `${head}.${tail}` : `${head}${tail}`;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Peringatan bila penulisan angka ambigu (satu pemisah + tepat 3 digit
 * ekor) — tampil di kolom Catatan preview agar operator melihat tafsirnya.
 */
export function numberAmbiguityWarning(raw: string, kind: ImportNumberKind): string | null {
  const t = raw.trim();
  if (!/^\d+[.,]\d{3}$/.test(t)) return null;
  if (t.includes(".") && kind === "weight") return `Angka '${t}' dibaca sebagai desimal`;
  return `Angka '${t}' dibaca sebagai ribuan`;
}

/** Prefix error yang BUKAN fatal: unknown yang punya jalur auto-create. */
export const AUTO_CREATABLE_PREFIXES = ["Kategori '", "Merk '", "Satuan '"];

/**
 * Fatal = ada error selain unknown auto-creatable — termasuk duplikat SKU
 * dan unknown Supplier/Gudang/Rak/Bin yang tak punya jalur auto-create
 * (backend pasti 422 `exists` bila lolos).
 */
export function isRowFatalError(errors: string[]): boolean {
  return errors.some((e) => !AUTO_CREATABLE_PREFIXES.some((p) => e.startsWith(p)));
}

export function resolveImportRowStatus(row: {
  errors: string[];
  autoCreateCat?: ImportAutoCreateEntry | undefined;
  autoCreateMerk?: ImportAutoCreateEntry | undefined;
  autoCreateUnit?: ImportAutoCreateEntry | undefined;
}): ImportRowStatus {
  if (isRowFatalError(row.errors)) return "error";
  const anyChecked =
    row.autoCreateCat?.checked || row.autoCreateMerk?.checked || row.autoCreateUnit?.checked;
  if (anyChecked) return "auto_create";
  const anyEntry = row.autoCreateCat || row.autoCreateMerk || row.autoCreateUnit;
  // Entry ada tapi semua dimatikan → dilewati impor (bukan valid).
  return anyEntry ? "skipped" : "valid";
}

export const REQUIRED_CSV_HEADERS = ["Nama Barang", "Kategori", "Harga Pokok", "Harga Jual"];

/** Normalisasi header: strip BOM/trim/case-insensitive ke label kanonik. */
export function normalizeHeaderKey(key: string, known: readonly string[]): string {
  const t = key.replace(/^\uFEFF/, "").trim();
  return known.find((h) => h.toLowerCase() === t.toLowerCase()) ?? key;
}
