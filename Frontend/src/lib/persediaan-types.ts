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
  from_bin_id: number | null;
  from_bin: string | null;
  to_bin_id: number | null;
  to_bin: string | null;
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
  partner: string | null;
  reference_no: string | null;
  pic: string | null;
  note: string | null;
  posted_at: string | null;
  created_by: string | null;
  line_count: number;
  lines?: StockDocumentLineApi[];
};
