// Dummy data generator for KelolaGudang (UI only, no backend).

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260731);
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

export const formatIDR = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
// Compact IDR for stat cards / KPI values: "Rp 725 M", "Rp 12,9 M", "Rp 850 rb".
// Below 1 juta falls back to the full format so small amounts stay readable.
const compactIDR = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const formatIDRCompact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? "Rp " + compactIDR.format(n) : formatIDR(n);
export const formatNumber = (n: number) => n.toLocaleString("id-ID");
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const categories = [
  "Sparepart Mesin",
  "Material Bangunan",
  "Alat Listrik",
  "Consumable",
  "Kemasan",
  "Bahan Baku",
  "Elektronik",
  "Alat Tulis",
  "Farmasi",
  "Makanan & Minuman",
  "Perlengkapan Safety",
  "Percetakan",
  "Otomotif",
  "Plumbing",
  "Peralatan Tangan",
];

export const subCategories = [
  "Bearing",
  "Pipa",
  "Kabel",
  "Sarung Tangan",
  "Kardus",
  "Tinta",
  "Baut & Mur",
  "Filter",
];

export const brands = [
  "Nachi",
  "Philips",
  "Maspion",
  "SKF",
  "Panasonic",
  "Krisbow",
  "Tekiro",
  "3M",
  "Bosch",
  "Kenmaster",
  "Onda",
  "Rucika",
];

export const units = ["PCS", "BOX", "SET", "ROLL", "LTR", "KG", "DUS", "METER"];

export const warehouses = [
  { id: "GD-01", name: "Gudang Pusat Jakarta", city: "Jakarta Timur" },
  { id: "GD-02", name: "Gudang Bekasi", city: "Bekasi" },
  { id: "GD-03", name: "Gudang Surabaya", city: "Surabaya" },
  { id: "GD-04", name: "Gudang Bandung", city: "Bandung" },
  { id: "GD-05", name: "Gudang Semarang", city: "Semarang" },
  { id: "GD-06", name: "Gudang Medan", city: "Medan" },
  { id: "GD-07", name: "Gudang Makassar", city: "Makassar" },
  { id: "GD-08", name: "Gudang Transit Cikarang", city: "Cikarang" },
];

const namePrefix = [
  "Bearing",
  "Pipa PVC",
  "Kabel NYA",
  "Lampu LED",
  "Sarung Tangan",
  "Kardus Packing",
  "Tinta Printer",
  "Baut Hex",
  "Filter Oli",
  "Selang Hidrolik",
  "Cat Tembok",
  "Masker Respirator",
  "Kertas HVS",
  "Oli Mesin",
  "Kunci Pas",
  "Helm Safety",
  "Semen Instan",
  "Stop Kontak",
  "Gerinda Disc",
  "Sealant Silikon",
];
const nameSuffix = [
  '1/2"',
  '3/4"',
  "6205",
  "6305",
  "12W",
  "20W",
  "A4 80gr",
  "M8x40",
  "M10x50",
  "5 Liter",
  "Type B",
  "Heavy Duty",
  "Premium",
  "Industrial",
  "4 Inch",
  "Grade A",
];

export type Item = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  subCategory: string;
  brand: string;
  supplier: string;
  warehouse: string;
  rack: string;
  bin: string;
  stock: number;
  reserved: number;
  unit: string;
  cost: number;
  price: number;
  min: number;
  max: number;
  weight: number;
  dimension: string;
  leadTime: number;
  status: "Aktif" | "Nonaktif";
  hue: number;
  lastMove: string;
  moving: "Fast" | "Medium" | "Slow" | "Dead";
};

export const suppliers = Array.from({ length: 120 }, (_, i) => {
  const n = [
    "PT Sinar Jaya Abadi",
    "CV Mitra Teknik",
    "PT Anugerah Logam",
    "UD Sumber Rejeki",
    "PT Karya Mandiri",
    "CV Cahaya Sentosa",
    "PT Global Parts",
    "UD Berkah Utama",
  ][i % 8];
  return {
    id: `SUP-${String(i + 1).padStart(3, "0")}`,
    name: `${n} ${Math.floor(i / 8) + 1}`,
    phone: `08${int(1111111111, 9999999999)}`,
    city: pick(["Jakarta", "Bekasi", "Surabaya", "Bandung", "Semarang", "Medan"]),
    terms: pick(["NET 30", "NET 14", "COD", "NET 45"]),
  };
});

export const customers = Array.from({ length: 40 }, (_, i) => ({
  id: `CUS-${String(i + 1).padStart(3, "0")}`,
  name: `${["PT Maju", "CV Terang", "Toko Sentral", "PT Bangun"][i % 4]} ${i + 1}`,
  city: pick(["Jakarta", "Bekasi", "Surabaya", "Bandung", "Depok"]),
  segment: pick(["Retail", "Distributor", "Proyek", "Korporat"]),
}));

export const departments = ["Produksi", "Maintenance", "Logistik", "QC", "Proyek", "Umum"];
export const projects = [
  "Proyek Tol Cisumdawu",
  "Renovasi Line 3",
  "Instalasi Panel Gedung B",
  "Maintenance Rutin Q3",
  "Ekspansi Gudang Bekasi",
];

export const items: Item[] = Array.from({ length: 300 }, (_, i) => {
  const stock = rnd() < 0.07 ? 0 : int(0, 1800);
  const min = int(20, 150);
  const cost = int(8, 900) * 1000;
  const daysAgo = int(0, 240);
  const d = new Date(2026, 6, 31);
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `ITM-${String(i + 1).padStart(4, "0")}`,
    sku: `SKU-${String(10000 + i * 7).slice(0, 5)}-${String(i + 1).padStart(3, "0")}`,
    barcode: `899${String(1000000 + i * 137).padStart(10, "0")}`,
    name: `${pick(namePrefix)} ${pick(nameSuffix)}`,
    category: pick(categories),
    subCategory: pick(subCategories),
    brand: pick(brands),
    supplier: pick(suppliers).name,
    warehouse: pick(warehouses).name,
    rack: `RAK-${pick(["A", "B", "C", "D", "E"])}${int(1, 12)}`,
    bin: `BIN-${int(1, 9)}${pick(["A", "B", "C"])}`,
    stock,
    reserved: stock > 0 ? int(0, Math.min(60, stock)) : 0,
    unit: pick(units),
    cost,
    price: Math.round(cost * (1.15 + rnd() * 0.4)),
    min,
    max: min * int(6, 14),
    weight: Number((rnd() * 12 + 0.1).toFixed(2)),
    dimension: `${int(5, 60)} x ${int(5, 40)} x ${int(2, 30)} cm`,
    leadTime: int(1, 21),
    status: rnd() < 0.94 ? "Aktif" : "Nonaktif",
    hue: int(0, 359),
    lastMove: d.toISOString(),
    moving: daysAgo > 150 ? "Dead" : daysAgo > 60 ? "Slow" : daysAgo > 20 ? "Medium" : "Fast",
  };
});

export const stockStatus = (it: Item) =>
  it.stock === 0
    ? { label: "Habis", tone: "danger" as const }
    : it.stock <= it.min
      ? { label: "Menipis", tone: "warning" as const }
      : it.stock >= it.max
        ? { label: "Overstock", tone: "info" as const }
        : { label: "Normal", tone: "success" as const };

export type TrxType =
  | "Barang Masuk"
  | "Barang Keluar"
  | "Transfer Gudang"
  | "Stock Adjustment"
  | "Stock Opname"
  | "Retur Pembelian"
  | "Retur Penjualan";

export type Trx = {
  id: string;
  no: string;
  type: TrxType;
  date: string;
  warehouse: string;
  destination?: string | undefined;
  partner: string;
  reference: string;
  qty: number;
  value: number;
  status: "Draft" | "Menunggu Approval" | "Selesai" | "Dibatalkan" | "Dalam Perjalanan";
  pic: string;
  lines: { name: string; sku: string; qty: number; unit: string; price: number }[];
};

const pics = [
  "Rudi Hartono",
  "Siti Aminah",
  "Bayu Pratama",
  "Dewi Lestari",
  "Agus Salim",
  "Nur Hidayat",
];
const trxTypes: TrxType[] = [
  "Barang Masuk",
  "Barang Keluar",
  "Transfer Gudang",
  "Stock Adjustment",
  "Stock Opname",
  "Retur Pembelian",
  "Retur Penjualan",
];

const prefixOf: Record<TrxType, string> = {
  "Barang Masuk": "BM",
  "Barang Keluar": "BK",
  "Transfer Gudang": "TF",
  "Stock Adjustment": "ADJ",
  "Stock Opname": "SO",
  "Retur Pembelian": "RTB",
  "Retur Penjualan": "RTJ",
};

export const transactions: Trx[] = Array.from({ length: 2000 }, (_, i) => {
  const type = i % 3 === 0 ? "Barang Masuk" : i % 3 === 1 ? "Barang Keluar" : pick(trxTypes);
  const d = new Date(2026, 6, 31);
  d.setDate(d.getDate() - int(0, 330));
  const lines = Array.from({ length: int(1, 5) }, () => {
    const it = pick(items);
    return {
      name: it.name,
      sku: it.sku,
      qty: int(1, 90),
      unit: it.unit,
      price: it.cost,
    };
  });
  const qty = lines.reduce((a, b) => a + b.qty, 0);
  return {
    id: `TRX-${i + 1}`,
    no: `${prefixOf[type]}/2026/${String(i + 1).padStart(5, "0")}`,
    type,
    date: d.toISOString(),
    warehouse: pick(warehouses).name,
    destination: type === "Transfer Gudang" ? pick(warehouses).name : undefined,
    partner:
      type === "Barang Masuk" || type === "Retur Pembelian"
        ? pick(suppliers).name
        : pick(customers).name,
    reference: `PO-${int(10000, 99999)}`,
    qty,
    value: lines.reduce((a, b) => a + b.qty * b.price, 0),
    status: pick([
      "Selesai",
      "Selesai",
      "Selesai",
      "Draft",
      "Menunggu Approval",
      "Dalam Perjalanan",
      "Dibatalkan",
    ]) as Trx["status"],
    pic: pick(pics),
    lines,
  };
}).sort((a, b) => +new Date(b.date) - +new Date(a.date));

export const monthly = [
  "Ags",
  "Sep",
  "Okt",
  "Nov",
  "Des",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
].map((m, i) => ({
  month: m,
  masuk: int(1200, 4200),
  keluar: int(1000, 3900),
  saldo: 12000 + i * int(100, 900),
  nilai: int(3200, 6100) * 1_000_000,
}));

export const totalValue = items.reduce((a, b) => a + b.stock * b.cost, 0);
export const lowStock = items.filter((i) => i.stock > 0 && i.stock <= i.min);
export const outStock = items.filter((i) => i.stock === 0);

export const activities = transactions.slice(0, 14).map((t) => ({
  id: t.id,
  type: t.type,
  no: t.no,
  pic: t.pic,
  warehouse: t.warehouse,
  qty: t.qty,
  date: t.date,
}));

export const notifications = [
  {
    id: "n1",
    title: "Stock hampir habis",
    body: `${lowStock.length} barang berada di bawah stok minimum`,
    time: "5 menit lalu",
    tone: "warning" as const,
  },
  {
    id: "n2",
    title: "Barang masuk diterima",
    body: `${transactions[0]!.no} dari ${transactions[0]!.partner}`,
    time: "22 menit lalu",
    tone: "success" as const,
  },
  {
    id: "n3",
    title: "Transfer gudang selesai",
    body: "TF/2026/00412 Bekasi → Surabaya",
    time: "1 jam lalu",
    tone: "info" as const,
  },
  {
    id: "n4",
    title: "Stock opname selesai",
    body: "Opname Gudang Pusat Jakarta — selisih 14 item",
    time: "3 jam lalu",
    tone: "info" as const,
  },
  {
    id: "n5",
    title: "Menunggu approval",
    body: "6 transaksi menunggu persetujuan supervisor",
    time: "Kemarin",
    tone: "warning" as const,
  },
];

export const opnameSessions = warehouses.slice(0, 5).map((w, i) => {
  const total = int(120, 460);
  const checked = int(20, total);
  return {
    id: `OPN-2026-${String(i + 1).padStart(3, "0")}`,
    warehouse: w.name,
    scheduled: `2026-07-${String(10 + i * 3).padStart(2, "0")}`,
    total,
    checked,
    diff: int(0, 24),
    pic: pick(pics),
    status: (i === 0 ? "Berjalan" : i === 1 ? "Berjalan" : i === 2 ? "Dijadwalkan" : "Selesai") as
      "Berjalan" | "Dijadwalkan" | "Selesai",
  };
});

export function stockCard(item: Item) {
  let saldo = item.stock;
  return Array.from({ length: 12 }, (_, i) => {
    const masuk = i % 3 === 0 ? int(20, 240) : 0;
    const keluar = masuk ? 0 : int(5, 160);
    const row = {
      id: `${item.id}-KS-${i}`,
      date: new Date(2026, 6, 30 - i * 2).toISOString(),
      no: `${masuk ? "BM" : "BK"}/2026/${String(int(1000, 9999))}`,
      type: masuk ? "Barang Masuk" : "Barang Keluar",
      masuk,
      keluar,
      saldo,
      unit: item.unit,
      pic: pick(pics),
      note: masuk ? "Penerimaan dari supplier" : "Pengeluaran ke produksi",
      warehouse: item.warehouse,
    };
    saldo = saldo - masuk + keluar;
    return row;
  });
}

export type StockCardRow = ReturnType<typeof stockCard>[number];

/** Build a read-only transaction object from a stock-card row (UI dummy). */
export function trxFromStockCard(row: StockCardRow, item: Item): Trx {
  const qty = row.masuk || row.keluar;
  return {
    id: row.id,
    no: row.no,
    type: row.masuk ? "Barang Masuk" : "Barang Keluar",
    date: row.date,
    warehouse: row.warehouse,
    partner: row.masuk ? item.supplier : "Departemen Produksi",
    reference: `REF-${row.no.split("/").pop()}`,
    qty,
    value: qty * item.cost,
    status: "Selesai",
    pic: row.pic,
    lines: [{ name: item.name, sku: item.sku, qty, unit: item.unit, price: item.cost }],
  };
}

export const valuationMethods = ["FIFO", "Average", "Maximum Cost"] as const;
export type ValuationMethod = (typeof valuationMethods)[number];
export const valuationFactor: Record<ValuationMethod, number> = {
  FIFO: 1,
  Average: 0.94,
  "Maximum Cost": 1.12,
};

export type WorkOrder = {
  id: string;
  no: string;
  project: string;
  product: string;
  target: number;
  unit: string;
  start: string;
  finish: string;
  pic: string;
  status: "Perencanaan" | "Berjalan" | "Selesai" | "Ditunda";
};

export const workOrders: WorkOrder[] = Array.from({ length: 24 }, (_, i) => ({
  id: `WO-${i + 1}`,
  no: `WO/2026/${String(i + 1).padStart(4, "0")}`,
  project: projects[i % projects.length]!,
  product: [
    "Rakitan Panel Listrik",
    "Frame Konveyor",
    "Bracket Mesin",
    "Kabinet Kontrol",
    "Unit Filter Udara",
  ][i % 5]!,
  target: (i + 2) * 25,
  unit: units[i % units.length]!,
  start: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, "0")}`,
  finish: `2026-0${(i % 6) + 2}-${String((i % 25) + 3).padStart(2, "0")}`,
  pic: pics[i % pics.length]!,
  status: (["Berjalan", "Perencanaan", "Selesai", "Ditunda"] as const)[i % 4]!,
}));

export type OpnameLine = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  system: number;
  physical: number;
  diff: number;
  value: number;
};

export function opnameLines(sessionId: string): OpnameLine[] {
  const seed = sessionId.length;
  return items.slice(seed, seed + 10).map((it, i) => {
    const diff = ((i * 5 + seed) % 7) - 3;
    return {
      id: `${sessionId}-${it.id}`,
      name: it.name,
      sku: it.sku,
      unit: it.unit,
      system: it.stock,
      physical: it.stock + diff,
      diff,
      value: diff * it.cost,
    };
  });
}
/* ================= Pengadaan (Procurement) ================= */

export type ProcLine = {
  name: string;
  sku: string;
  qty: number;
  unit: string;
  price: number;
};

export type ProcDoc = {
  id: string;
  no: string;
  kind: "PR" | "PO" | "GR";
  date: string;
  needDate: string;
  requester: string;
  department: string;
  supplier: string;
  warehouse: string;
  reference: string;
  qty: number;
  value: number;
  status:
    | "Draft"
    | "Menunggu Approval"
    | "Disetujui"
    | "Ditolak"
    | "Sebagian Diterima"
    | "Selesai"
    | "Dibatalkan";
  note: string;
  lines: ProcLine[];
};

const procStatus: Record<ProcDoc["kind"], ProcDoc["status"][]> = {
  PR: ["Draft", "Menunggu Approval", "Disetujui", "Disetujui", "Ditolak"],
  PO: ["Menunggu Approval", "Disetujui", "Sebagian Diterima", "Selesai", "Selesai", "Dibatalkan"],
  GR: ["Draft", "Sebagian Diterima", "Selesai", "Selesai", "Selesai"],
};

function makeProc(kind: ProcDoc["kind"], count: number, prefix: string): ProcDoc[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 6, 31);
    d.setDate(d.getDate() - int(0, 200));
    const need = new Date(d);
    need.setDate(need.getDate() + int(3, 30));
    const lines: ProcLine[] = Array.from({ length: int(1, 5) }, () => {
      const it = pick(items);
      return { name: it.name, sku: it.sku, qty: int(5, 250), unit: it.unit, price: it.cost };
    });
    const qty = lines.reduce((a, b) => a + b.qty, 0);
    return {
      id: `${kind}-${i + 1}`,
      no: `${prefix}/2026/${String(i + 1).padStart(4, "0")}`,
      kind,
      date: d.toISOString(),
      needDate: need.toISOString(),
      requester: pick(pics),
      department: pick(departments),
      supplier: pick(suppliers).name,
      warehouse: pick(warehouses).name,
      reference:
        kind === "PR"
          ? `BUDGET-${int(1000, 9999)}`
          : kind === "PO"
            ? `PR/2026/${String(int(1, 60)).padStart(4, "0")}`
            : `PO/2026/${String(int(1, 80)).padStart(4, "0")}`,
      qty,
      value: lines.reduce((a, b) => a + b.qty * b.price, 0),
      status: pick(procStatus[kind]),
      note: pick([
        "Kebutuhan operasional rutin",
        "Restock item minimum",
        "Permintaan proyek berjalan",
        "Penggantian sparepart mesin",
        "Pengadaan tahunan",
      ]),
      lines,
    };
  }).sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export const purchaseRequests = makeProc("PR", 60, "PR");
export const purchaseOrders = makeProc("PO", 80, "PO");
export const goodsReceipts = makeProc("GR", 70, "GR");

/* ================= System ================= */

export type AuditLog = {
  id: string;
  time: string;
  user: string;
  role: string;
  action: "Create" | "Update" | "Delete" | "Approve" | "Login" | "Export";
  module: string;
  record: string;
  ip: string;
  detail: string;
};

export const auditLogs: AuditLog[] = Array.from({ length: 160 }, (_, i) => {
  const d = new Date(2026, 6, 31, 17, 30);
  d.setMinutes(d.getMinutes() - i * int(20, 400));
  const action = pick([
    "Create",
    "Update",
    "Delete",
    "Approve",
    "Login",
    "Export",
  ]) as AuditLog["action"];
  const module = pick([
    "Master Barang",
    "Barang Masuk",
    "Barang Keluar",
    "Purchase Order",
    "Purchase Request",
    "Stock Opname",
    "Pengguna",
  ]);
  return {
    id: `LOG-${i + 1}`,
    time: d.toISOString(),
    user: pick(pics),
    role: pick(["Admin", "Operator Gudang", "Supervisor", "Purchasing"]),
    action,
    module,
    record: `${pick(["BM", "BK", "PO", "PR", "SKU"])}/2026/${String(int(1, 9999)).padStart(4, "0")}`,
    ip: `10.20.${int(0, 12)}.${int(2, 240)}`,
    detail: `${action} pada modul ${module}`,
  };
});
