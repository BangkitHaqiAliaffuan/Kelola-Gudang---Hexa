// Katalog endpoint API nyata (sumber kebenaran: Backend/routes/api.php).
// Saat menambah route di backend, sinkronkan entri di sini agar halaman
// System → Developer tetap akurat. Auth: Sanctum bearer-token
// (localStorage kg-token → Authorization: Bearer). Level kebutuhan dari
// HTTP verb (GET/HEAD=Baca, POST/PUT/PATCH=Tulis, DELETE=Kelola) kecuali
// aksi auth-only yang ditandai.

export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export type ApiParam = {
  name: string;
  required?: boolean;
  placeholder?: string;
};

export type ApiCatalogEntry = {
  method: ApiMethod;
  /** Path dengan prefix /api, mis. /master/items */
  path: string;
  desc: string;
  /** Gate RBAC, mis. "Master Data · Tulis" atau "auth-only (assignee)" */
  gate: string;
  /** Param untuk konsol coba (hanya dipakai entri GET) */
  params?: ApiParam[];
};

export type ApiCatalogGroup = {
  group: string;
  entries: ApiCatalogEntry[];
};

const TULIS = (m: string) => `${m} · Tulis`;
const BACA = (m: string) => `${m} · baca`;
const KELOLA = (m: string) => `${m} · Kelola`;

/** Baris CRUD standar satu resource master (index/store/show/update/destroy). */
function masterCrud(resource: string, desc: string): ApiCatalogEntry[] {
  const p = `/master/${resource}`;
  return [
    {
      method: "GET",
      path: p,
      desc: `Daftar ${desc}`,
      gate: BACA("Master Data"),
      params: [{ name: "search" }, { name: "per_page", placeholder: "20" }],
    },
    { method: "POST", path: p, desc: `Buat ${desc}`, gate: TULIS("Master Data") },
    { method: "GET", path: `${p}/{id}`, desc: `Detail ${desc}`, gate: BACA("Master Data") },
    { method: "PUT", path: `${p}/{id}`, desc: `Ubah ${desc}`, gate: TULIS("Master Data") },
    { method: "DELETE", path: `${p}/{id}`, desc: `Hapus ${desc}`, gate: KELOLA("Master Data") },
  ];
}

export const API_CATALOG: ApiCatalogGroup[] = [
  {
    group: "Auth",
    entries: [
      {
        method: "POST",
        path: "/auth/login",
        desc: "Login (throttle 5/menit) → { data, access, token }",
        gate: "publik",
      },
      { method: "POST", path: "/auth/logout", desc: "Hapus token sesi ini", gate: "auth" },
      { method: "GET", path: "/auth/me", desc: "Profil + peta akses role saya", gate: "auth" },
    ],
  },
  {
    group: "Master Data",
    entries: [
      ...masterCrud("categories", "kategori"),
      ...masterCrud("sub-categories", "sub kategori"),
      ...masterCrud("merks", "merk"),
      ...masterCrud("units", "satuan"),
      ...masterCrud("warehouses", "gudang"),
      ...masterCrud("racks", "rak"),
      ...masterCrud("bins", "bin location"),
      ...masterCrud("suppliers", "supplier"),
      ...masterCrud("customers", "customer"),
      ...masterCrud("vendors", "vendor"),
      ...masterCrud("users", "user"),
      ...masterCrud("departments", "departemen"),
      ...masterCrud("projects", "proyek"),
      ...masterCrud("work-orders", "work order"),
      ...masterCrud("items", "barang"),
      {
        method: "POST",
        path: "/master/items/bulk-delete",
        desc: "Hapus banyak barang",
        gate: KELOLA("Master Data"),
      },
      {
        method: "POST",
        path: "/master/items/bulk-status",
        desc: "Ubah status banyak barang",
        gate: TULIS("Master Data"),
      },
      {
        method: "POST",
        path: "/master/items/bulk-import",
        desc: "Impor barang via CSV",
        gate: TULIS("Master Data"),
      },
      {
        method: "GET",
        path: "/master/items/lookup",
        desc: "Cari barang via barcode/SKU",
        gate: BACA("Master Data"),
        params: [{ name: "code", required: true, placeholder: "SKU/barcode" }],
      },
      {
        method: "GET",
        path: "/master/items/cost-drift",
        desc: "Selisih cost master vs ledger",
        gate: BACA("Master Data"),
      },
      {
        method: "POST",
        path: "/master/items/sync-cost",
        desc: "Sinkron cost master dari ledger",
        gate: TULIS("Master Data"),
      },
      {
        method: "GET",
        path: "/master/roles",
        desc: "Daftar role + matriks akses",
        gate: BACA("Master Data"),
      },
      {
        method: "PUT",
        path: "/master/roles/{role}",
        desc: "Ganti akses satu role",
        gate: TULIS("Master Data"),
      },
    ],
  },
  {
    group: "Persediaan",
    entries: [
      {
        method: "GET",
        path: "/persediaan/stock",
        desc: "Stock saat ini per lokasi",
        gate: BACA("Persediaan"),
        params: [
          { name: "search" },
          { name: "warehouse_id" },
          { name: "status", placeholder: "Habis/Menipis/Overstock/Normal" },
        ],
      },
      {
        method: "GET",
        path: "/persediaan/stock-minimum",
        desc: "ADU, cover, saran reorder",
        gate: BACA("Persediaan"),
        params: [{ name: "days", placeholder: "14/30/60/90" }, { name: "warehouse_id" }],
      },
      {
        method: "GET",
        path: "/persediaan/stock-card",
        desc: "Riwayat + saldo berjalan satu barang",
        gate: BACA("Persediaan"),
        params: [
          { name: "item_id", required: true },
          { name: "warehouse_id" },
          { name: "method", placeholder: "FIFO/Average/Maximum Cost" },
        ],
      },
      {
        method: "GET",
        path: "/persediaan/valuation",
        desc: "Nilai per barang (3 metode) + kelas gerak",
        gate: BACA("Persediaan"),
        params: [{ name: "warehouse_id" }, { name: "category_id" }, { name: "search" }],
      },
      {
        method: "GET",
        path: "/persediaan/stock-documents",
        desc: "Daftar dokumen mutasi",
        gate: BACA("Persediaan"),
        params: [
          { name: "type" },
          { name: "status" },
          { name: "warehouse_id" },
          { name: "search" },
        ],
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents",
        desc: "Buat dokumen (Masuk/Keluar/Transfer/Retur/Opname/Adjustment)",
        gate: TULIS("Persediaan"),
      },
      {
        method: "GET",
        path: "/persediaan/stock-documents/summary",
        desc: "Ringkasan masuk vs keluar",
        gate: BACA("Persediaan"),
      },
      {
        method: "GET",
        path: "/persediaan/stock-documents/{id}",
        desc: "Detail + baris dokumen",
        gate: BACA("Persediaan"),
      },
      {
        method: "PUT",
        path: "/persediaan/stock-documents/{id}",
        desc: "Ubah sesi opname Draft",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/post",
        desc: "Posting ke ledger",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/cancel",
        desc: "Batalkan dokumen",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/submit-approval",
        desc: "Ajukan approval adjustment",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/submit-review",
        desc: "Ajukan review opname",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/lock",
        desc: "Kunci edit sesi opname",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/heartbeat",
        desc: "Perpanjang lock",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/unlock",
        desc: "Lepas lock milik sendiri",
        gate: TULIS("Persediaan"),
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/approve",
        desc: "Setujui (hanya assignee)",
        gate: "auth-only · assignee",
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/reject",
        desc: "Tolak (hanya assignee)",
        gate: "auth-only · assignee",
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/approve-review",
        desc: "Setujui review (hanya assignee)",
        gate: "auth-only · assignee",
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/reject-review",
        desc: "Tolak review (hanya assignee)",
        gate: "auth-only · assignee",
      },
      {
        method: "POST",
        path: "/persediaan/stock-documents/{id}/force-unlock",
        desc: "Rebut lock (Kelola/Auditor)",
        gate: "auth-only · Kelola/Auditor",
      },
    ],
  },
  {
    group: "Pengadaan",
    entries: [
      {
        method: "GET",
        path: "/pengadaan/proc-docs",
        desc: "Daftar PR/PO",
        gate: BACA("Pengadaan"),
        params: [{ name: "kind", placeholder: "PR/PO" }, { name: "status" }],
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs",
        desc: "Buat PR/PO",
        gate: TULIS("Pengadaan"),
      },
      {
        method: "GET",
        path: "/pengadaan/proc-docs/{id}",
        desc: "Detail dokumen",
        gate: BACA("Pengadaan"),
      },
      {
        method: "PUT",
        path: "/pengadaan/proc-docs/{id}",
        desc: "Ubah Draft",
        gate: TULIS("Pengadaan"),
      },
      {
        method: "DELETE",
        path: "/pengadaan/proc-docs/{id}",
        desc: "Hapus Draft",
        gate: KELOLA("Pengadaan"),
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs/{id}/submit",
        desc: "Ajukan approval",
        gate: TULIS("Pengadaan"),
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs/{id}/cancel",
        desc: "Batalkan dokumen",
        gate: TULIS("Pengadaan"),
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs/{id}/reassign",
        desc: "Alihkan approver (Kelola)",
        gate: KELOLA("Pengadaan"),
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs/{id}/approve",
        desc: "Setujui (hanya approver)",
        gate: "auth-only · approver",
      },
      {
        method: "POST",
        path: "/pengadaan/proc-docs/{id}/reject",
        desc: "Tolak (hanya approver)",
        gate: "auth-only · approver",
      },
    ],
  },
  {
    group: "Laporan",
    entries: [
      {
        method: "GET",
        path: "/laporan/mutasi",
        desc: "Agregat saldo awal/masuk/keluar/akhir",
        gate: BACA("Laporan"),
        params: [
          { name: "from", required: true, placeholder: "2026-08-01" },
          { name: "to", required: true, placeholder: "2026-09-10" },
          { name: "warehouse_id" },
          { name: "category_id" },
          { name: "search" },
        ],
      },
      {
        method: "GET",
        path: "/laporan/keluar-analytics",
        desc: "Analitik keluar per tujuan/bulan",
        gate: BACA("Laporan"),
        params: [
          { name: "from", required: true },
          { name: "to", required: true },
          { name: "warehouse_id" },
        ],
      },
      {
        method: "GET",
        path: "/laporan/transaksi-analytics",
        desc: "Analitik Masuk/Transfer/Retur",
        gate: BACA("Laporan"),
        params: [
          { name: "type", required: true, placeholder: "Penerimaan/Transfer Gudang/..." },
          { name: "from", required: true },
          { name: "to", required: true },
        ],
      },
      {
        method: "GET",
        path: "/laporan/fast-moving",
        desc: "Velocity per barang + risiko stockout",
        gate: BACA("Laporan"),
        params: [
          { name: "from", required: true },
          { name: "to", required: true },
          { name: "warehouse_id" },
          { name: "category_id" },
          { name: "search" },
        ],
      },
    ],
  },
  {
    group: "System",
    entries: [
      {
        method: "GET",
        path: "/system/audit-logs",
        desc: "Jejak audit (filter aksi/modul)",
        gate: "Audit Trails · baca",
        params: [{ name: "action" }, { name: "module" }, { name: "search" }],
      },
    ],
  },
];

/** Contoh payload nyata (tombol salin di halaman Developer). */
export const API_PAYLOAD_EXAMPLES: { title: string; body: string }[] = [
  {
    title: "POST /api/auth/login",
    body: `{
  "email": "rudi.hartono@kelolagudang.id",
  "password": "********"
}`,
  },
  {
    title: "POST /api/persediaan/stock-documents — Penerimaan langsung Selesai",
    body: `{
  "type": "Penerimaan",
  "status": "Selesai",
  "document_date": "2026-09-10",
  "warehouse_id": 1,
  "partner": "PT Sinar Jaya Abadi",
  "reference_no": "PO-0045",
  "lines": [
    { "item_id": 12, "qty": 40, "unit_cost": 125000, "to_bin_id": 7 }
  ]
}`,
  },
  {
    title: "POST /api/persediaan/stock-documents — Transfer Gudang",
    body: `{
  "type": "Transfer Gudang",
  "status": "Selesai",
  "document_date": "2026-09-10",
  "warehouse_id": 1,
  "destination_warehouse_id": 2,
  "lines": [
    { "item_id": 12, "qty": 10, "from_bin_id": 7, "to_bin_id": 21 }
  ]
}`,
  },
  {
    title: "POST /api/pengadaan/proc-docs — Purchase Request",
    body: `{
  "kind": "PR",
  "document_date": "2026-09-10",
  "department_id": 1,
  "supplier_id": 1,
  "warehouse_id": 1,
  "note": "Restock item minimum",
  "lines": [
    { "item_id": 12, "qty": 50, "price": 1500 }
  ]
}`,
  },
];
