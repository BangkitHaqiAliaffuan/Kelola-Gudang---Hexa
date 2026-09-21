import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, TableProperties } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Render tabel untuk hasil tool AI (tool_results) supaya data analitik/stok
 * bisa dibaca manusia, bukan JSON mentah.
 *
 * KEAMANAN: hanya merender nilai primitif (string/number/boolean/null) sebagai
 * teks React — tidak ada dangerouslySetInnerHTML, tidak ada link yang bisa
 * diklik. Struktur bersarang (objek/array di dalam baris) dirangkum sebagai
 * teks JSON pendek yang inert.
 *
 * Bentuk data yang dikenali (lihat AiToolHandler backend):
 * - `analisis_data`: { columns: string[], rows: Record[] } — header eksplisit.
 * - `cari_barang`:   { count, items: Record[] }
 * - `stok_barang`/`analisis_data`: { count, rows: Record[] }
 * - `daftar_gudang`: { count, warehouses: Record[] }
 * - `daftar_dokumen_stok`: { count, documents: Record[] }
 * - `daftar_supplier`/`daftar_customer`: { count, suppliers|customers: Record[] }
 */

/** Kunci array baris yang dikenal, berurutan prioritas. */
const ROW_KEYS = [
  "items",
  "rows",
  "warehouses",
  "documents",
  "suppliers",
  "customers",
  "proposals",
] as const;

export type ExtractedTable = {
  /** Nama kunci sumber (mis. "items") — untuk label. */
  sourceKey: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Ekstrak tabel dari satu hasil tool. Mengembalikan null bila hasil bukan
 * berbentuk tabel (mis. hanya error/teks), supaya pemanggil bisa fallback.
 */
export function extractTable(result: unknown): ExtractedTable | null {
  if (!isRecord(result)) return null;

  // Bentuk analisis_data: kolom eksplisit dari SQL.
  const explicit = result["columns"];
  if (Array.isArray(explicit) && explicit.every((c) => typeof c === "string")) {
    const rowsRaw = result["rows"];
    if (Array.isArray(rowsRaw)) {
      const rows = rowsRaw.filter(isRecord);
      const columns = explicit.length > 0 ? (explicit as string[]) : unionKeys(rows);
      return { sourceKey: "rows", columns, rows };
    }
  }

  // Bentuk tool lain: array-of-object di bawah salah satu kunci dikenal.
  for (const key of ROW_KEYS) {
    const val = result[key];
    if (Array.isArray(val) && val.length > 0 && val.every(isRecord)) {
      const rows = val as Record<string, unknown>[];
      return { sourceKey: key, columns: unionKeys(rows), rows };
    }
  }

  return null;
}

/** Gabungan kunci baris (menjaga urutan kemunculan pertama). */
function unionKeys(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.includes(k)) seen.push(k);
    }
  }
  return seen;
}

/** Label kolom human-readable dari kunci snake_case/Inggris. */
const LABELS: Record<string, string> = {
  id: "ID",
  item_id: "ID",
  sku: "SKU",
  nama: "Nama",
  name: "Nama",
  satuan: "Satuan",
  status: "Status",
  stok: "Stok",
  stock: "Stok",
  stok_total: "Stok",
  stok_minimum: "Stok Min",
  min_stock: "Stok Min",
  stok_maksimum: "Stok Maks",
  max_stock: "Stok Maks",
  reserved: "Reserved",
  di_bawah_minimum: "Di Bawah Min",
  selisih_minimum: "Selisih",
  gudang: "Gudang",
  gudang_default: "Gudang",
  warehouse_id: "ID Gudang",
  bin: "Bin",
  code: "Kode",
  kota: "Kota",
  city: "Kota",
  no: "Nomor",
  tipe: "Tipe",
  type: "Tipe",
  tanggal: "Tanggal",
  document_date: "Tanggal",
  tujuan_gudang: "Gudang Tujuan",
  partner: "Rekanan",
  qty: "Qty",
};

export function labelFor(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format nilai sel menjadi teks pendek (aman, inert). */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return value.toLocaleString("id-ID");
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.length}]`;
  return "{…}";
}

/** Apakah kolom ini sebaiknya di-align rata-kanan (numerik)? */
function isNumericColumn(rows: Record<string, unknown>[], key: string): boolean {
  return rows.every((r) => {
    const v = r[key];
    return v === null || v === undefined || typeof v === "number" || typeof v === "boolean";
  });
}

const MAX_VISIBLE_ROWS = 30;

/**
 * Tabel hasil tool. Ringkas oleh default; bisa di-expand bila baris banyak.
 */
export function AiResultTable({
  title,
  table,
  className,
}: {
  title?: string;
  table: ExtractedTable;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { columns, rows } = table;
  const overflow = rows.length > MAX_VISIBLE_ROWS;
  const shown = useMemo(
    () => (overflow && !expanded ? rows.slice(0, MAX_VISIBLE_ROWS) : rows),
    [rows, overflow, expanded],
  );

  if (columns.length === 0 || rows.length === 0) return null;

  return (
    <div className={cn("mt-2 overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-2.5 py-1.5">
        <TableProperties className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground">{title ?? "Hasil data"}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {rows.length.toLocaleString("id-ID")} baris
        </span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={cn(
                    "whitespace-nowrap border-b border-border bg-muted px-2 py-1.5 text-left font-semibold text-muted-foreground",
                    isNumericColumn(rows, col) && "text-right",
                  )}
                >
                  {labelFor(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                {columns.map((col) => (
                  <td
                    key={col}
                    className={cn(
                      "whitespace-nowrap px-2 py-1.5 align-top",
                      isNumericColumn(rows, col) && "text-right tabular-nums",
                    )}
                  >
                    <CellValue value={row[col]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1 border-t border-border bg-muted/30 px-2 py-1.5 text-[11px] text-primary hover:bg-muted/60"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Ringkas
            </>
          ) : (
            <>
              <ChevronRight className="h-3.5 w-3.5" /> Tampilkan semua ({rows.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Nilai satu sel. Boolean "di bawah minimum" diberi warna status. */
function CellValue({ value }: { value: unknown }): ReactNode {
  if (typeof value === "boolean") {
    return (
      <span
        className={
          value ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        }
      >
        {formatCell(value)}
      </span>
    );
  }
  return <span>{formatCell(value)}</span>;
}

/** Judul ramah per nama tool (untuk header tabel). */
export function tableTitleFor(tool: string): string {
  switch (tool) {
    case "cari_barang":
      return "Daftar Barang";
    case "stok_barang":
      return "Stok per Gudang";
    case "daftar_gudang":
      return "Daftar Gudang";
    case "daftar_dokumen_stok":
      return "Dokumen Stok";
    case "daftar_supplier":
      return "Daftar Supplier";
    case "daftar_customer":
      return "Daftar Customer";
    case "analisis_data":
      return "Hasil Analitik";
    default:
      return "Hasil data";
  }
}

/**
 * Render seluruh tool_results sebuah jawaban sebagai daftar tabel.
 * Hasil yang bukan tabel (mis. hanya { error }) dilewati.
 * Hanya tabel TERAKHIR (jawaban final) yang tampil penuh; hasil antara
 * (mis. query eksplorasi model) terlipat di "Proses analisis" agar tak
 * membanjiri layar. Satu hasil → tampil penuh seperti sebelumnya.
 */
export function AiResultTables({ results }: { results: Array<{ tool: string; result: unknown }> }) {
  const [showProcess, setShowProcess] = useState(false);

  const tables = results
    .map((r, i) => ({ tool: r.tool, table: extractTable(r.result), index: i }))
    .filter((x): x is { tool: string; table: ExtractedTable; index: number } => x.table !== null);

  if (tables.length === 0) return null;

  const final = tables[tables.length - 1]!;
  const prior = tables.slice(0, -1);

  return (
    <div className="space-y-1.5">
      <AiResultTable
        key={`${final.tool}-${final.index}`}
        title={tableTitleFor(final.tool)}
        table={final.table}
      />
      {prior.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowProcess((v) => !v)}
            aria-expanded={showProcess}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/60"
          >
            {showProcess ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Sembunyikan proses analisis ({prior.length})
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5" /> Proses analisis ({prior.length})
              </>
            )}
          </button>
          {showProcess && (
            <div className="space-y-1.5">
              {prior.map((t) => (
                <AiResultTable
                  key={`${t.tool}-${t.index}`}
                  title={tableTitleFor(t.tool)}
                  table={t.table}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
