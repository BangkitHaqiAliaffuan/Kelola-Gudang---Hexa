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
  bin_id: number | null;
  bin_rack_warehouse_id?: number | null;
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
  document_id: number | null;
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
  warehouse?: string | null;
  destination?: string | null;
  source?: string | null;
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
  unit_price: number | null;
  unit_price_estimated: boolean;
  note: string | null;
  reason_code: string | null;
  counted_by: string | null;
  counted_at: string | null;
  remaining_qty?: number | null;
  returned_qty?: number | null;
};

// Alasan selisih Stock Opname (root cause) — mirror StockDocumentLine::REASON_CODES.
export const opnameReasonCodes: Record<string, string> = {
  receiving_error: "Kesalahan penerimaan",
  picking_error: "Kesalahan pengambilan",
  damage: "Rusak",
  theft_shrinkage: "Hilang / susut",
  vendor_short_ship: "Kekurangan dari supplier",
  uom_mismatch: "Salah satuan",
  transfer_unposted: "Transfer belum diproses",
  location_error: "Salah lokasi / rak",
  data_entry: "Kesalahan input",
  other: "Lainnya",
};

export function opnameReasonLabel(code: string | null | undefined): string {
  return code ? (opnameReasonCodes[code] ?? code) : "—";
}

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
  customer_id: number | null;
  customer: string | null;
  department_id?: number | null;
  department?: string | null;
  project_id?: number | null;
  project?: string | null;
  partner: string | null;
  reference_no: string | null;
  pic: string | null;
  note: string | null;
  posted_at: string | null;
  submitted_at?: string | null;
  created_by: string | null;
  requester_user_id: number | null;
  requester: string | null;
  approver_user_id?: number | null;
  approver?: string | null;
  approved_at?: string | null;
  decision_note?: string | null;
  blind_count: boolean;
  frozen_at: string | null;
  line_count: number;
  checked_count?: number;
  qty_total?: number;
  value_total?: number;
  revenue_total?: number;
  lines?: StockDocumentLineApi[];
  locked_by_user_id?: number | null;
  locked_by?: string | null;
  locked_at?: string | null;
  is_locked_by_me?: boolean;
};

export type StockDocumentSummaryApi = {
  masuk: { count: number; qty: number; value: number };
  keluar: { count: number; qty: number };
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
// - Retur Penjualan: perilaku = Penerimaan (arah IN, `to_bin_id` wajib, qty
//   positif, server memakai unit_cost baris sumber), nomor `RJ/YYYY/#####`,
//   partner = customer. Bila `source_document_id` (dokumen Pengeluaran sumber)
//   dikirim, setiap baris wajib memakai `source_line_id` baris Pengeluaran
//   tersebut — server memvalidasi relasi + sisa qty (cap abs qty baris BK),
//   `to_bin_id` harus sama dengan `from_bin_id` baris sumber, dan meng-backfill
//   harga baris sumber. Tanpa sumber, baris memakai `unit_cost` dari input.
// - Stock Adjustment: koreksi stok dengan delta BERTANDA — `qty` positif = tambah
//   stok (IN, `to_bin_id` wajib), `qty` negatif = kurangi stok (OUT, `from_bin_id`
//   wajib). Nomor `ADJ/YYYY/#####`. `unit_cost` di-backfill server (moving average
//   di bin, valuasi-netral). `reason_code` (alasan selisih) wajib selalu diisi.

export type StockDocumentTypeToStore =
  | "Penerimaan"
  | "Pengeluaran"
  | "Transfer Gudang"
  | "Retur Pembelian"
  | "Retur Penjualan"
  | "Stock Opname"
  | "Stock Adjustment";

export type StockDocumentLinePayload = {
  item_id: number;
  qty?: number | null;
  system_qty?: number | null;
  actual_qty?: number | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  to_bin_id?: number | null;
  from_bin_id?: number | null;
  source_line_id?: number | null;
  note?: string | null;
  reason_code?: string | null;
};

export type StockDocumentPayload = {
  type: StockDocumentTypeToStore;
  status: "Draft" | "Selesai" | "Menunggu Approval";
  document_date: string;
  warehouse_id: number;
  destination_warehouse_id?: number | null;
  source_document_id?: number | null;
  customer_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  partner: string | null;
  reference_no: string | null;
  pic?: string | null;
  note: string | null;
  blind_count?: boolean;
  lines: StockDocumentLinePayload[];
};

// ---- Laporan Mutasi (GET /api/laporan/mutasi) ----
// Agregat per item per periode: saldo_awal, masuk, keluar, saldo_akhir, nilai.

export type LaporanMutasiRowApi = {
  id: number;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  category: string | null;
  category_id: number | null;
  saldo_awal: number;
  masuk: number;
  keluar: number;
  saldo_akhir: number;
  nilai_akhir: number;
  unit_cost_avg: number;
};

export type LaporanMutasiParams = {
  from: string;
  to: string;
  warehouseId?: number | null;
  categoryId?: number | null;
  search?: string | null;
  perPage?: number;
  page?: number;
};

// ---- Analitik Barang Keluar (GET /api/laporan/keluar-analytics) ----
// Agregat Pengeluaran per tujuan (Customer/Departemen/Proyek) per bulan.
// "nilai" = nilai pokok persediaan (qty × unit_cost), BUKAN revenue.

export type TujuanJenis = "customer" | "departemen" | "proyek" | "lainnya";

export type KeluarAnalyticsParams = {
  from: string;
  to: string;
  warehouseId?: number | null;
  customerId?: number | null;
  departmentId?: number | null;
  projectId?: number | null;
  jenisTujuan?: TujuanJenis | null;
  atRiskDays?: number | null;
  varianceBand?: number | null;
};

export type TujuanBulanRow = {
  jenis: TujuanJenis;
  id: number | null;
  nama: string;
  bulan: string;
  qty: number;
  nilai: number;
  dokumen: number;
};

export type TopTujuanRow = {
  jenis: TujuanJenis;
  id: number | null;
  nama: string;
  qty: number;
  nilai: number;
  dokumen: number;
  share: number;
  share_kumulatif: number;
};

export type KeluarAnalyticsApi = {
  periode: { from: string; to: string };
  ringkasan: {
    nilai: number;
    qty: number;
    dokumen: number;
    rata_nilai: number;
    mom: {
      bulan: string;
      bulan_lalu: string;
      nilai: number;
      nilai_lalu: number;
      pct: number | null;
      qty: number;
      qty_lalu: number;
      qty_pct: number | null;
    } | null;
  };
  per_bulan: { bulan: string; qty: number; nilai: number; dokumen: number }[];
  per_tujuan_per_bulan: TujuanBulanRow[];
  top_tujuan: TopTujuanRow[];
  per_jenis: { jenis: TujuanJenis; qty: number; nilai: number; dokumen: number }[];
  per_segmen: { segmen: string; qty: number; nilai: number; dokumen: number }[];
  top_items: {
    item_id: number;
    sku: string | null;
    nama: string;
    satuan: string | null;
    qty: number;
    nilai: number;
  }[];
  retur: {
    qty: number;
    nilai: number;
    omzet: number;
    rate_qty: number;
    rate_nilai: number;
    per_alasan: { alasan: string; qty: number; nilai: number; dokumen: number }[];
    per_tujuan: {
      jenis: TujuanJenis;
      id: number | null;
      nama: string;
      qty: number;
      nilai: number;
      dokumen: number;
    }[];
    per_item: {
      item_id: number;
      sku: string | null;
      nama: string;
      satuan: string | null;
      qty: number;
      nilai: number;
    }[];
  };
  aktivitas: {
    jenis: TujuanJenis;
    id: number | null;
    nama: string;
    dokumen: number;
    nilai: number;
    terakhir: string | null;
    hari_sejak_terakhir: number | null;
    status: "baru" | "aktif" | "at-risk";
  }[];
  proses: {
    lead_median_hari: number | null;
    lead_avg_hari: number | null;
    tertahan_dokumen: number;
    tertahan_nilai: number;
    aging: { rentang: string; dokumen: number; nilai: number }[];
  };
  omzet: {
    total: number;
    hpp: number;
    margin: number;
    margin_pct: number | null;
    bersih: number;
    cakupan: { aktual: number; estimasi: number; tanpa_harga: number };
    per_customer_per_bulan: {
      jenis: TujuanJenis;
      id: number | null;
      nama: string;
      bulan: string;
      qty: number;
      omzet: number;
      hpp: number;
      margin: number;
      margin_pct: number | null;
      dokumen: number;
    }[];
    top_margin: {
      jenis: TujuanJenis;
      id: number | null;
      nama: string;
      qty: number;
      omzet: number;
      hpp: number;
      dokumen: number;
      margin: number;
      margin_pct: number | null;
      share_omzet: number;
    }[];
  };
  proyek: {
    id: number | null;
    nama: string;
    nilai_keluar: number;
    qty_keluar: number;
    budget: number | null;
    serapan_budget_pct: number | null;
    status_proyek: string | null;
    items: {
      item_id: number;
      sku: string | null;
      nama: string;
      satuan: string | null;
      target_qty: number;
      keluar_qty: number;
      nilai_keluar: number;
      varians_pct: number | null;
      flag: boolean;
      work_order: string | null;
    }[];
  }[];
};

// ---- Update dokumen Stock Opname draft (PUT /api/persediaan/stock-documents/{id}) ----
// Mengganti seluruh baris sesi opname; system_qty baris yang ada dipertahankan
// dari snapshot dokumen asli (baris baru boleh kosong — di-backfill server).

export type UpdateStockDocumentPayload = {
  document_date?: string | null;
  pic?: string | null;
  note?: string | null;
  lines: {
    item_id: number;
    from_bin_id: number | null;
    system_qty?: number | null;
    actual_qty?: number | null;
    unit_cost?: number | null;
    note?: string | null;
    reason_code?: string | null;
  }[];
};
