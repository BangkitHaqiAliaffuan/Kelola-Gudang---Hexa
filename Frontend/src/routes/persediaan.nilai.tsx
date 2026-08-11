import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, TrendingUp, TrendingDown, PackageX, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { valuationMethodLabels } from "@/lib/persediaan-types";
import { cn } from "@/lib/utils";
import {
  categories,
  formatIDR,
  items,
  valuationFactor,
  valuationMethods,
  type ValuationMethod,
} from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/nilai")({
  head: () => ({
    meta: [
      { title: "Nilai Persediaan — KelolaGudang" },
      {
        name: "description",
        content: "Analisis nilai persediaan dengan metode FIFO, Average, dan Estimasi Maksimum.",
      },
      { property: "og:title", content: "Nilai Persediaan — KelolaGudang" },
      { property: "og:description", content: "Bandingkan nilai stok antar metode perhitungan." },
    ],
  }),
  component: NilaiPersediaan,
});

function NilaiPersediaan() {
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const f = valuationFactor[method];

  const total = useMemo(() => items.reduce((a, b) => a + b.stock * b.cost, 0) * f, [f]);
  const byCategory = useMemo(
    () =>
      categories
        .map((c) => ({
          category: c.length > 12 ? c.slice(0, 12) + "…" : c,
          nilai:
            items.filter((i) => i.category === c).reduce((a, b) => a + b.stock * b.cost, 0) * f,
        }))
        .sort((a, b) => b.nilai - a.nilai),
    [f],
  );
  const sorted = [...items].sort((a, b) => b.stock * b.cost - a.stock * a.cost);
  const dead = items.filter((i) => i.moving === "Dead");
  const fast = items.filter((i) => i.moving === "Fast");

  return (
    <>
      <PageHeader
        title="Nilai Persediaan"
        description="Analisis nilai stok berdasarkan metode perhitungan"
        actions={
          <div className="flex rounded-xl border border-border bg-card p-1">
            {valuationMethods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  method === m
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {valuationMethodLabels[m]}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total Nilai Stock" value={formatIDR(total)} hint={`metode ${valuationMethodLabels[method]}`} icon={Wallet} />
        <StatCard
          label="Barang Termahal"
          value={formatIDR(sorted[0]!.stock * sorted[0]!.cost * f)}
          hint={sorted[0]!.name}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Barang Termurah"
          value={formatIDR(sorted[sorted.length - 1]!.cost * f)}
          hint={sorted[sorted.length - 1]!.name}
          icon={TrendingDown}
          tone="info"
        />
        <StatCard label="Dead Stock" value={String(dead.length)} hint="tidak bergerak > 5 bulan" icon={PackageX} tone="danger" />
        <StatCard label="Fast Moving" value={String(fast.length)} hint="bergerak < 20 hari" icon={Zap} tone="warning" />
      </div>

      <Panel title={`Nilai per Kategori — ${valuationMethodLabels[method]}`} description="Nilai berubah mengikuti metode yang dipilih">
        <ResponsiveContainer width="100%" height={330}>
          <BarChart data={byCategory} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${Math.round(v / 1_000_000)} Jt`}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="category" width={110} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v: number) => formatIDR(v)}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="nilai" name="Nilai" fill="var(--primary)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="10 Barang Nilai Tertinggi">
          <div className="space-y-2">
            {sorted.slice(0, 10).map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.sku}</p>
                </div>
                <span className="text-sm font-semibold">{formatIDR(it.stock * it.cost * f)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Perbandingan Metode" description="Simulasi nilai persediaan (dummy)">
          <div className="space-y-3">
            {valuationMethods.map((m) => {
              const v = items.reduce((a, b) => a + b.stock * b.cost, 0) * valuationFactor[m];
              return (
                <div key={m} className="rounded-xl border border-border p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <p className="truncate text-sm font-medium">{valuationMethodLabels[m]}</p>
                    <Pill tone={m === method ? "brand" : "neutral"}>{formatIDR(v)}</Pill>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(valuationFactor[m] / 1.12) * 100}%`,
                        backgroundImage: "var(--gradient-primary)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}