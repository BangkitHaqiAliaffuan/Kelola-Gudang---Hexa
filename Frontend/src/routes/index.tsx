import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Package,
  Barcode,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  TriangleAlert,
  PackageX,
  Wallet,
  ClipboardCheck,
  ArrowLeftRight,
  QrCode,
  CheckCheck,
  Lock,
  Archive,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Panel, Pill, StatCard, TableSkeleton, type Tone } from "@/components/wms/kit";
import { Progress } from "@/components/ui/progress";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import { useAuth } from "@/hooks/use-auth";
import { useItems, useWarehouses } from "@/hooks/use-master";
import {
  useStockDocumentSummary,
  useStockDocuments,
  useStockMinimum,
  useStockValuation,
} from "@/hooks/use-persediaan";
import type { StockDocumentApi, StockMinimumApi, StockMinimumStatus } from "@/lib/persediaan-types";

/** Baris dokumen opname: list API mengagregasi checked_count per dokumen. */
type OpnameDoc = StockDocumentApi & { checked_count?: number };

/** Urutan severitas untuk panel "Perlu Perhatian" (paling kritis dulu). */
const SEVERITY_ORDER: Record<StockMinimumStatus, number> = {
  Habis: 0,
  Kritis: 1,
  Menipis: 2,
  Normal: 3,
};

const MIN_TONE: Record<StockMinimumStatus, Tone> = {
  Habis: "danger",
  Kritis: "danger",
  Menipis: "warning",
  Normal: "success",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Gudang — KelolaGudang" },
      {
        name: "description",
        content:
          "Pantau stok, barang masuk & keluar, nilai persediaan, dan aktivitas gudang harian dalam satu dashboard.",
      },
      { property: "og:title", content: "Dashboard Gudang — KelolaGudang" },
      {
        property: "og:description",
        content: "Ringkasan stok, transaksi, dan aktivitas gudang secara real-time.",
      },
    ],
  }),
  component: Dashboard,
});

const quickActions = [
  {
    label: "Barang Masuk",
    to: "/transaksi/entri/$section",
    params: { section: "masuk" },
    icon: ArrowDownToLine,
    module: "Persediaan",
  },
  {
    label: "Barang Keluar",
    to: "/transaksi/entri/$section",
    params: { section: "keluar" },
    icon: ArrowUpFromLine,
    module: "Persediaan",
  },
  {
    label: "Transfer",
    to: "/transaksi/entri/$section",
    params: { section: "transfer" },
    icon: ArrowLeftRight,
    module: "Persediaan",
  },
  {
    label: "Stock Opname",
    to: "/opname/$section",
    params: { section: "jadwal" },
    icon: ClipboardCheck,
    module: "Stock Opname",
  },
  { label: "Cetak Barcode", to: "/barcode", params: undefined, icon: QrCode, module: undefined },
  {
    label: "Tambah Barang",
    to: "/master/barang",
    params: undefined,
    icon: Package,
    module: "Master Data",
  },
  { label: "Stock", to: "/persediaan/kartu-stock", params: undefined, icon: Archive, module: "Persediaan" },
] as const;

const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    fontSize: 12,
    boxShadow: "var(--shadow-soft)",
  },
};

const activityTone: Record<string, Tone> = {
  Penerimaan: "success",
  Pengeluaran: "warning",
  "Transfer Gudang": "info",
  "Retur Pembelian": "warning",
  "Retur Penjualan": "success",
  "Stock Opname": "info",
};

/** Titik bulanan (12 bulan terakhir) dari dokumen mutasi real, nol untuk bulan kosong. */
type MonthPoint = { month: string; masuk: number; keluar: number; saldo: number; nilai: number };

function buildMonthly(docs: StockDocumentApi[]): MonthPoint[] {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("id-ID", { month: "short" }),
      masuk: 0,
      keluar: 0,
      nilai: 0,
    };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const doc of docs) {
    if (doc.status === "Draft") continue;
    if (doc.type !== "Penerimaan" && doc.type !== "Pengeluaran") continue;
    if (!doc.document_date) continue;
    const d = new Date(doc.document_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const qty = doc.qty_total ?? 0;
    const value = doc.value_total ?? 0;
    if (doc.type === "Penerimaan") {
      bucket.masuk += qty;
    } else {
      bucket.keluar += Math.abs(qty);
    }
    // qty keluar bernilai negatif → nilai otomatis terkurangi (net masuk-keluar).
    bucket.nilai += value;
  }
  let saldo = 0;
  let nilai = 0;
  return months.map((m) => {
    saldo += m.masuk - m.keluar;
    nilai += m.nilai;
    return { month: m.label, masuk: m.masuk, keluar: m.keluar, saldo, nilai };
  });
}

function Dashboard() {
  const { user, hasModuleLevel } = useAuth();
  const visibleQuickActions = quickActions.filter(
    (a) => !a.module || hasModuleLevel(a.module, "Tulis"),
  );

  // Statistik master & persediaan.
  const { data: itemsData, isLoading: itemsLoading } = useItems();
  const { data: warehousesData, isLoading: warehousesLoading } = useWarehouses();
  const { data: valData, isLoading: valLoading } = useStockValuation();
  const totalSku = itemsData?.data.length ?? 0;
  const totalGudang = warehousesData?.data.length ?? 0;
  const valuationRows = valData?.data ?? [];
  const totalStock = valuationRows.reduce((a, b) => a + b.stock, 0);
  const totalReserved = valuationRows.reduce((a, b) => a + b.reserved, 0);
  const inventoryValue = valuationRows.reduce((a, b) => a + b.nilai_fifo, 0);

  // Persetujuan tertunda.
  const { data: pendingData, isLoading: pendingLoading } = useStockDocuments({
    status: "Menunggu Approval",
  });
  const pending = pendingData?.data.length ?? 0;

  // Semua dokumen mutasi: agregasi chart bulanan + aktivitas terkini.
  const { data: docsData, isLoading: docsLoading } = useStockDocuments();
  const allDocs = (docsData?.data ?? []) as StockDocumentApi[];
  const monthly = buildMonthly(allDocs);
  const recentActivities = allDocs
    .filter((d) => d.status !== "Draft")
    .map((d) => ({
      id: d.id,
      type: d.type,
      no: d.no,
      warehouse: d.warehouse ?? "—",
      qty: Math.abs(d.qty_total ?? 0) || d.line_count,
      pic: d.pic ?? d.created_by ?? "—",
      date: d.document_date,
    }))
    .slice(0, 14);

  const { data: opnameDocs, isLoading: opnameLoading } = useStockDocuments({
    type: "Stock Opname",
    status: "Draft",
  });
  const running = ((opnameDocs?.data ?? []) as OpnameDoc[]).filter((d) => d.status === "Draft");

  const { data: summaryData, isLoading: summaryLoading } = useStockDocumentSummary();
  const summary = summaryData?.data;
  const masukQty = summary?.masuk.qty ?? 0;
  const masukValue = summary?.masuk.value ?? 0;
  const keluarQty = Math.abs(summary?.keluar.qty ?? 0);
  const masukCount = summary?.masuk.count ?? 0;
  const keluarCount = summary?.keluar.count ?? 0;

  const { data: minData, isLoading: minLoading } = useStockMinimum();
  const minRows = ((minData?.data ?? []) as StockMinimumApi[]).filter((r) => r.status !== "Normal");
  const stockMenipis = minRows.length;
  const stockHabis = minRows.filter((r) => r.status === "Habis").length;
  const attention = [...minRows]
    .sort((a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status])
    .slice(0, 6);

  const todayLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stats = [
    {
      label: "Total Item",
      value: valLoading ? "…" : formatNumber(totalStock),
      hint: "seluruh gudang",
      icon: Package,
      tone: "brand" as const,
      loading: valLoading,
    },
    {
      label: "Total SKU",
      value: itemsLoading ? "…" : formatNumber(totalSku),
      hint: "barang aktif terdaftar",
      icon: Barcode,
      tone: "info" as const,
      loading: itemsLoading,
    },
    {
      label: "Total Gudang",
      value: warehousesLoading ? "…" : String(totalGudang),
      hint: "lokasi penyimpanan",
      icon: Warehouse,
      tone: "neutral" as const,
      loading: warehousesLoading,
    },
    {
      label: "Stok Tereservasi",
      value: valLoading ? "…" : formatNumber(totalReserved),
      hint: "terikat permintaan",
      icon: Lock,
      tone: "info" as const,
      loading: valLoading,
    },
    {
      label: "Total Barang Masuk",
      value: summaryLoading ? "…" : formatNumber(masukQty),
      hint: `${masukCount} dokumen`,
      icon: ArrowDownToLine,
      tone: "success" as const,
      loading: summaryLoading,
    },
    {
      label: "Nilai Barang Masuk",
      value: summaryLoading ? "…" : formatIDRCompact(masukValue),
      ...(summaryLoading ? {} : { valueTitle: formatIDR(masukValue) }),
      hint: `${masukCount} dokumen`,
      icon: ArrowDownToLine,
      tone: "success" as const,
      loading: summaryLoading,
    },
    {
      label: "Total Barang Keluar",
      value: summaryLoading ? "…" : formatNumber(keluarQty),
      hint: `${keluarCount} dokumen`,
      icon: ArrowUpFromLine,
      tone: "warning" as const,
      loading: summaryLoading,
    },
    {
      label: "Stock Menipis",
      value: formatNumber(stockMenipis),
      hint: "di bawah minimum",
      icon: TriangleAlert,
      tone: "warning" as const,
      loading: minLoading,
    },
    {
      label: "Stock Habis",
      value: formatNumber(stockHabis),
      hint: "perlu restock segera",
      icon: PackageX,
      tone: "danger" as const,
      loading: minLoading,
    },
    {
      label: "Nilai Persediaan",
      value: valLoading ? "…" : formatIDRCompact(inventoryValue),
      ...(valLoading ? {} : { valueTitle: formatIDR(inventoryValue) }),
      hint: "metode FIFO",
      icon: Wallet,
      tone: "brand" as const,
      loading: valLoading,
    },
    {
      label: "Pending Approval",
      value: pendingLoading ? "…" : String(pending),
      hint: "menunggu supervisor",
      icon: CheckCheck,
      tone: "info" as const,
      loading: pendingLoading,
    },
    {
      label: "Stock Opname Berjalan",
      value: String(running.length),
      hint: "sesi aktif",
      icon: ClipboardCheck,
      tone: "success" as const,
      loading: opnameLoading,
    },
  ];

  return (
    <>
      <PageHeader
        title={user ? `Selamat datang, ${user.name} 👋` : "Selamat datang 👋"}
        description={`Ringkasan operasional gudang hari ini, ${todayLabel}.`}
        actions={
          stockHabis > 0 ? (
            <Pill tone="danger">{formatNumber(stockHabis)} stok habis</Pill>
          ) : (
            <Pill tone="success">Semua sistem normal</Pill>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Panel title="Aksi Cepat" description="Mulai pekerjaan dengan satu klik">
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${{ 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6", 7: "lg:grid-cols-7" }[Math.min(visibleQuickActions.length, 7)] ?? "lg:grid-cols-6"}`}
        >
          {visibleQuickActions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              params={a.params as never}
              className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center text-xs font-semibold transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <a.icon className="h-5 w-5" />
              </span>
              {a.label}
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Barang Masuk & Keluar per Bulan" description="12 bulan terakhir">
          {docsLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="masuk" name="Masuk" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                <Bar
                  dataKey="keluar"
                  name="Keluar"
                  fill="var(--primary-glow)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Pergerakan Stock" description="Saldo akhir stok per bulan">
          {docsLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} />
                <Tooltip {...chartTooltip} />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Nilai Persediaan" description="Tren nilai stok (Rupiah)">
        {docsLoading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="nilaiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v / 1_000_000)} Jt`}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={54}
              />
              <Tooltip formatter={(v: number) => formatIDR(v)} {...chartTooltip} />
              <Area
                type="monotone"
                dataKey="nilai"
                name="Nilai"
                stroke="var(--primary)"
                strokeWidth={2.5}
                fill="url(#nilaiGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Aktivitas Terkini" description="Dokumen mutasi terbaru">
          {docsLoading ? (
            <TableSkeleton rows={6} cols={3} />
          ) : recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {recentActivities.map((a) => (
                <li key={a.id} className="relative animate-fade-in">
                  <span className="absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full border-2 border-background bg-primary" />
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {a.type} · {a.no}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.warehouse} — {formatNumber(a.qty)} unit oleh {a.pic}
                      </p>
                    </div>
                    <Pill tone={activityTone[a.type] ?? "info"}>
                      {new Date(a.date).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </Pill>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Stock Opname Berjalan">
            {opnameLoading ? (
              <TableSkeleton rows={2} cols={3} />
            ) : running.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada sesi opname yang sedang berjalan.
              </p>
            ) : (
              <div className="space-y-4">
                {running.map((o) => {
                  const total = o.line_count;
                  const checked = o.checked_count ?? 0;
                  return (
                    <Link
                      key={o.id}
                      to="/opname/$section"
                      params={{ section: "proses" }}
                      className="block rounded-xl p-2 transition-colors hover:bg-accent/50"
                    >
                      <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <p className="truncate text-sm font-medium">{o.warehouse}</p>
                        <span className="text-xs text-muted-foreground">
                          {checked}/{total}
                        </span>
                      </div>
                      <Progress value={total > 0 ? (checked / total) * 100 : 0} className="h-2" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Perlu Perhatian" description="Stok di bawah minimum">
            {minLoading ? (
              <TableSkeleton rows={4} />
            ) : attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada stok yang perlu perhatian.</p>
            ) : (
              <div className="space-y-2.5">
                {attention.map((it) => (
                  <Link
                    key={it.id}
                    to="/master/barang/$id"
                    params={{ id: String(it.id) }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-border px-3 py-2 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{it.sku}</p>
                    </div>
                    <Pill tone={MIN_TONE[it.status]}>
                      {it.total_stock}/{it.min} {it.unit}
                    </Pill>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
