import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { PageHeader, Panel, Pill, StatCard, TableSkeleton } from "@/components/wms/kit";
import { Progress } from "@/components/ui/progress";
import {
  activities,
  formatIDR,
  formatIDRCompact,
  formatNumber,
  items,
  lowStock,
  monthly,
  outStock,
  totalValue,
  transactions,
  warehouses,
} from "@/lib/wms-data";
import { useAuth } from "@/hooks/use-auth";
import { useStockDocuments } from "@/hooks/use-persediaan";
import type { StockDocumentApi } from "@/lib/persediaan-types";

/** Baris dokumen opname: list API mengagregasi checked_count per dokumen. */
type OpnameDoc = StockDocumentApi & { checked_count?: number };

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
  { label: "Barang Masuk", to: "/transaksi/masuk", icon: ArrowDownToLine, module: "Persediaan" },
  { label: "Barang Keluar", to: "/transaksi/keluar", icon: ArrowUpFromLine, module: "Persediaan" },
  { label: "Transfer", to: "/transaksi/transfer", icon: ArrowLeftRight, module: "Persediaan" },
  { label: "Stock Opname", to: "/opname/proses", icon: ClipboardCheck, module: "Stock Opname" },
  { label: "Cetak Barcode", to: "/barcode", icon: QrCode },
  { label: "Tambah Barang", to: "/master/barang", icon: Package, module: "Master Data" },
];

const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    fontSize: 12,
    boxShadow: "var(--shadow-soft)",
  },
};

function useSkeleton(ms = 600) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

function Dashboard() {
  const { hasModuleLevel } = useAuth();
  const visibleQuickActions = quickActions.filter(
    (a) => !a.module || hasModuleLevel(a.module, "Tulis"),
  );
  const loading = useSkeleton();
  const masukToday = transactions.filter((t) => t.type === "Barang Masuk").slice(0, 24);
  const keluarToday = transactions.filter((t) => t.type === "Barang Keluar").slice(0, 18);
  const pending = transactions.filter((t) => t.status === "Menunggu Approval").length;
  const { data: opnameDocs, isLoading: opnameLoading } = useStockDocuments({
    type: "Stock Opname",
  });
  const running = ((opnameDocs?.data ?? []) as OpnameDoc[]).filter((d) => d.status === "Draft");

  const stats = [
    {
      label: "Total Item",
      value: formatNumber(items.reduce((a, b) => a + b.stock, 0)),
      hint: "seluruh gudang",
      icon: Package,
      tone: "brand" as const,
    },
    {
      label: "Total SKU",
      value: formatNumber(items.length),
      hint: "barang aktif terdaftar",
      icon: Barcode,
      tone: "info" as const,
    },
    {
      label: "Total Gudang",
      value: String(warehouses.length),
      hint: "lokasi penyimpanan",
      icon: Warehouse,
      tone: "neutral" as const,
    },
    {
      label: "Stok Tereservasi",
      value: formatNumber(items.reduce((a, b) => a + b.reserved, 0)),
      hint: "terikat permintaan",
      icon: Lock,
      tone: "info" as const,
    },
    {
      label: "Barang Masuk Hari Ini",
      value: formatNumber(masukToday.reduce((a, b) => a + b.qty, 0)),
      hint: `${masukToday.length} transaksi`,
      icon: ArrowDownToLine,
      tone: "success" as const,
    },
    {
      label: "Nilai Barang Masuk Hari Ini",
      value: formatIDRCompact(masukToday.reduce((a, b) => a + b.value, 0)),
      hint: `${masukToday.length} transaksi`,
      icon: ArrowDownToLine,
      tone: "success" as const,
    },
    {
      label: "Barang Keluar Hari Ini",
      value: formatNumber(keluarToday.reduce((a, b) => a + b.qty, 0)),
      hint: `${keluarToday.length} transaksi`,
      icon: ArrowUpFromLine,
      tone: "warning" as const,
    },
    {
      label: "Stock Menipis",
      value: formatNumber(lowStock.length),
      hint: "di bawah minimum",
      icon: TriangleAlert,
      tone: "warning" as const,
    },
    {
      label: "Stock Habis",
      value: formatNumber(outStock.length),
      hint: "perlu restock segera",
      icon: PackageX,
      tone: "danger" as const,
    },
    {
      label: "Nilai Persediaan",
      value: formatIDRCompact(totalValue),
      hint: "metode FIFO",
      icon: Wallet,
      tone: "brand" as const,
    },
    {
      label: "Pending Approval",
      value: String(pending),
      hint: "menunggu supervisor",
      icon: CheckCheck,
      tone: "info" as const,
    },
    {
      label: "Stock Opname Berjalan",
      value: String(running.length),
      hint: "sesi aktif",
      icon: ClipboardCheck,
      tone: "success" as const,
    },
  ];

  return (
    <>
      <PageHeader
        title="Selamat datang, Rudi 👋"
        description="Ringkasan operasional gudang hari ini, Jumat 31 Juli 2026."
        actions={<Pill tone="success">Semua sistem normal</Pill>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Panel title="Aksi Cepat" description="Mulai pekerjaan dengan satu klik">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {visibleQuickActions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
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
          {loading ? (
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
          {loading ? (
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
        {loading ? (
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
        <Panel title="Aktivitas Terkini" description="Pergerakan barang di seluruh gudang">
          {loading ? (
            <TableSkeleton rows={6} cols={3} />
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {activities.map((a) => (
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
                    <Pill
                      tone={
                        a.type === "Barang Masuk"
                          ? "success"
                          : a.type === "Barang Keluar"
                            ? "warning"
                            : "info"
                      }
                    >
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
            <div className="space-y-2.5">
              {lowStock.slice(0, 6).map((it) => (
                <Link
                  key={it.id}
                  to="/master/barang/$id"
                  params={{ id: it.id }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-border px-3 py-2 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{it.sku}</p>
                  </div>
                  <Pill tone="warning">
                    {it.stock}/{it.min} {it.unit}
                  </Pill>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
