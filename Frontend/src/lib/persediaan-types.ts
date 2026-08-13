// Types mirroring the Laravel Persediaan API (App\Http\Controllers\StockController +
// App\Http\Resources\StockRowResource).

export type ValuationMethod = "FIFO" | "Average" | "Maximum Cost";

export const valuationMethodLabels: Record<ValuationMethod, string> = {
  FIFO: "FIFO",
  Average: "Average",
  "Maximum Cost": "Estimasi Maksimum",
};

export type StockRowApi = {
  id: string;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  cost: number;
  warehouse_id: number;
  warehouse: string | null;
  rack: string | null;
  bin: string | null;
  bin_id: number;
  stock: number;
  reserved: number;
  available: number;
  unit_cost_avg: number;
  nilai: number;
  status: "Habis" | "Menipis" | "Overstock" | "Normal";
};

export type StockMinimumStatus = "Habis" | "Kritis" | "Menipis" | "Normal";

// ---- Stock Minimum (GET /api/persediaan/stock-minimum) ----
// One row per item: stock summed across locations + demand context
// (avg daily consumption, days of cover) and a suggested reorder qty.

export type StockMinimumApi = {
  id: number;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  category: string | null;
  supplier: string | null;
  min: number;
  max: number | null;
  cost: number;
  lead_time: number;
  total_stock: number;
  reserved: number;
  available: number;
  avg_daily_usage: number;
  days_of_cover: number | null;
  suggested_qty: number;
  status: StockMinimumStatus;
};

export type StockCardRowApi = {
  date: string;
  no: string;
  type: string;
  direction: "IN" | "OUT";
  masuk: number;
  keluar: number;
  saldo: number;
  unit: string | null;
  unit_cost: number;
  method_cost: number;
  nilai: number;
  pic: string;
  note: string;
  partner: string;
  reference: string;
};

export type StockCardApi = {
  item: {
    id: number;
    sku: string;
    name: string;
    unit: string | null;
    min: number | null;
    max: number | null;
    cost: number;
    warehouse: string | null;
    current_stock: number;
    reserved: number;
  };
  method: ValuationMethod;
  saldo_awal: number;
  saldo_akhir: number;
  rows: StockCardRowApi[];
};

// ---- Nilai Persediaan (GET /api/persediaan/valuation) ----
// One row per item: on-hand value under each valuation method (FIFO, Average,
// Maximum Cost), folded from the movement ledger, plus movement recency.

export const stockMovingTypes = ["Fast", "Medium", "Slow", "Dead"] as const;

export type StockMoving = (typeof stockMovingTypes)[number];

export type StockValuationApi = {
  id: number;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  category: string | null;
  min: number | null;
  max: number | null;
  cost: number;
  stock: number;
  reserved: number;
  available: number;
  unit_cost_fifo: number;
  unit_cost_avg: number;
  unit_cost_max: number;
  nilai_fifo: number;
  nilai_avg: number;
  nilai_max: number;
  last_move_at: string | null;
  moving: StockMoving;
};

// ---- Mutasi Stock (dokumen) ----

export const stockDocumentTypes = [
  "Penerimaan",
  "Pengeluaran",
  "Transfer Gudang",
  "Stock Adjustment",
  "Stock Opname",
  "Retur Pembelian",
  "Retur Penjualan",
] as const;

export type StockDocumentType = (typeof stockDocumentTypes)[number];

export const stockDocumentStatuses = [
  "Draft",
  "Menunggu Approval",
  "Selesai",
  "Dibatalkan",
  "Dalam Perjalanan",
] as const;

export type StockDocumentStatus = (typeof stockDocumentStatuses)[number];

export type StockDocumentLineApi = {
  id: number;
  line_no: number;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  qty: number | null;
  system_qty: number | null;
  actual_qty: number | null;
  variance: number | null;
  direction: "IN" | "OUT" | null;
  from_bin_id: number | null;
  from_bin: string | null;
  from_rack: string | null;
  to_bin_id: number | null;
  to_bin: string | null;
  to_rack: string | null;
  source_line_id: number | null;
  unit_cost: number;
  note: string | null;
};

export type StockDocumentApi = {
  id: number;
  no: string;
  type: StockDocumentType;
  status: StockDocumentStatus;
  document_date: string;
  warehouse_id: number | null;
  warehouse: string | null;
  destination_warehouse_id: number | null;
  destination: string | null;
  source_document_id: number | null;
  source_document: string | null;
  partner: string | null;
  reference_no: string | null;
  pic: string | null;
  note: string | null;
  posted_at: string | null;
  created_by: string | null;
  line_count: number;
  qty_total?: number;
  value_total?: number;
  lines?: StockDocumentLineApi[];
};

// ---- Pembuatan dokumen (POST /api/persediaan/stock-documents) ----
// Scope: Penerimaan, Pengeluaran, Transfer Gudang, Retur Pembelian & Retur Penjualan.
// - Penerimaan: baris memakai `to_bin_id` (arah IN memprioritaskan to_bin di
//   service); `from_bin_id` opsional. `unit_cost` diambil dari input.
// - Pengeluaran: baris memakai `from_bin_id` (sumber stok, arah OUT); `to_bin_id`
//   dikosongkan. `unit_cost` dibiarkan kosong — server meng-backfill moving
//   average di bin asal. `qty` selalu positif; server menegasinya saat simpan.
// - Transfer Gudang: `warehouse_id` = gudang asal, `destination_warehouse_id` =
//   tujuan (wajib, beda gudang). Baris memakai `from_bin_id` (bin sumber di gudang
//   asal) + `to_bin_id` (bin tujuan di gudang tujuan). `unit_cost` dibiarkan kosong
//   (server memakai moving average di bin asal). `qty` selalu positif.
// - Retur Pembelian: perilaku = Pengeluaran (arah OUT, `from_bin_id` wajib, qty
//   dinegasi server, unit_cost di-backfill), nomor `RP/YYYY/#####`, partner = supplier.
//   Bila `source_document_id` (dokumen Penerimaan sumber) dikirim, setiap baris
//   wajib memakai `source_line_id` baris Penerimaan tersebut — server memvalidasi
//   relasi + sisa qty dan meng-backfill harga beli asal dari baris sumber.
// - Retur Penjualan: perilaku = Penerimaan (arah IN, `to_bin_id` wajib, unit_cost
//   dari input), nomor `RJ/YYYY/#####`, partner = customer.

export type StockDocumentTypeToStore =
  "Penerimaan" | "Pengeluaran" | "Transfer Gudang" | "Retur Pembelian" | "Retur Penjualan";

export type StockDocumentLinePayload = {
  item_id: number;
  qty: number;
  unit_cost?: number | null;
  to_bin_id?: number | null;
  from_bin_id?: number | null;
  source_line_id?: number | null;
  note?: string | null;
};

export type StockDocumentPayload = {
  type: StockDocumentTypeToStore;
  status: "Draft" | "Selesai";
  document_date: string;
  warehouse_id: number;
  destination_warehouse_id?: number | null;
  source_document_id?: number | null;
  partner: string | null;
  reference_no: string | null;
  pic?: string | null;
  note: string | null;
  lines: StockDocumentLinePayload[];
};
