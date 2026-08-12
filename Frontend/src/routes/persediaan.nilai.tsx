import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, TrendingUp, TrendingDown, PackageX, Zap, Lock } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ALL,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TableSkeleton,
} from "@/components/wms/kit";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useStockValuation } from "@/hooks/use-persediaan";
import { valuationMethodLabels, type StockValuationApi } from "@/lib/persediaan-types";
import { cn } from "@/lib/utils";
import {
  formatIDR,
  formatIDRCompact,
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

function nilaiFor(row: StockValuationApi, method: ValuationMethod): number {
  return method === "FIFO" ? row.nilai_fifo : method === "Average" ? row.nilai_avg : row.nilai_max;
}

function unitCostFor(row: StockValuationApi, method: ValuationMethod): number {
  return method === "FIFO"
    ? row.unit_cost_fifo
    : method === "Average"
      ? row.unit_cost_avg
      : row.unit_cost_max;
}

function NilaiPersediaan() {
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);

  const { data: warehouses } = useWarehouses();
  const { data: cats } = useCategories();

  const whId = useMemo(() => warehouses?.data.find((w) => w.name === wh)?.id, [warehouses, wh]);
  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);

  const { data, isLoading } = useStockValuation({
    warehouseId: wh === ALL ? null : (whId ?? null),
    categoryId: cat === ALL ? null : (catId ?? null),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);

  const total = useMemo(() => rows.reduce((a, b) => a + nilaiFor(b, method), 0), [rows, method]);
  const nilaiReserved = useMemo(
    () => rows.reduce((a, b) => a + b.reserved * unitCostFor(b, method), 0),
    [rows, method],
  );

  const byCategory = useMemo(
    () =>
      rows
        .reduce<Array<{ category: string; nilai: number }>>((acc, row) => {
          const name = row.category ?? "Tanpa Kategori";
          const hit = acc.find((x) => x.category === name);
          if (hit) {
            hit.nilai += nilaiFor(row, method);
          } else {
            acc.push({ category: name, nilai: nilaiFor(row, method) });
          }
          return acc;
        }, [])
        .map((c) => ({
          category: c.category.length > 12 ? c.category.slice(0, 12) + "…" : c.category,
          nilai: c.nilai,
        }))
        .sort((a, b) => b.nilai - a.nilai),
    [rows, method],
  );

  const inStock = useMemo(() => rows.filter((r) => r.stock > 0), [rows]);
  const sorted = useMemo(
    () => [...inStock].sort((a, b) => nilaiFor(b, method) - nilaiFor(a, method)),
    [inStock, method],
  );
  const termahal = sorted[0];
  const termurah = sorted[sorted.length - 1];
  const dead = rows.filter((i) => i.moving === "Dead");
  const fast = rows.filter((i) => i.moving === "Fast");

  const totalByMethod = useMemo(
    () => ({
      FIFO: rows.reduce((a, b) => a + b.nilai_fifo, 0),
      Average: rows.reduce((a, b) => a + b.nilai_avg, 0),
      "Maximum Cost": rows.reduce((a, b) => a + b.nilai_max, 0),
    }),
    [rows],
  );
  const maxMethodTotal = Math.max(
    totalByMethod.FIFO,
    totalByMethod.Average,
    totalByMethod["Maximum Cost"],
    1,
  );

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

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

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2">
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouseNames}
          />
          <FilterSelect
            className="w-full"
            value={cat}
            onChange={setCat}
            placeholder="Semua Kategori"
            options={categoryNames}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total Nilai Stock"
          value={formatIDRCompact(total)}
          hint={`metode ${valuationMethodLabels[method]}`}
          icon={Wallet}
        />
        <StatCard
          label="Barang Termahal"
          value={formatIDRCompact(termahal ? nilaiFor(termahal, method) : 0)}
          hint={termahal?.name ?? "—"}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Barang Termurah"
          value={formatIDRCompact(termurah ? nilaiFor(termurah, method) : 0)}
          hint={termurah?.name ?? "—"}
          icon={TrendingDown}
          tone="info"
        />
        <StatCard
          label="Dead Stock"
          value={String(dead.length)}
          hint="tidak bergerak > 5 bulan"
          icon={PackageX}
          tone="danger"
        />
        <StatCard
          label="Fast Moving"
          value={String(fast.length)}
          hint="bergerak < 20 hari"
          icon={Zap}
          tone="warning"
        />
        <StatCard
          label="Nilai Tereservasi"
          value={formatIDRCompact(nilaiReserved)}
          hint="terikat reservasi"
          icon={Lock}
          tone="info"
        />
      </div>

      <Panel
        title={`Nilai per Kategori — ${valuationMethodLabels[method]}`}
        description="Nilai berubah mengikuti metode yang dipilih"
      >
        {isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : byCategory.length === 0 ? (
          <EmptyState
            title="Tidak ada data"
            description="Tidak ada nilai persediaan untuk filter ini."
          />
        ) : (
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
              <YAxis
                type="category"
                dataKey="category"
                width={110}
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
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
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="10 Barang Nilai Tertinggi">
          {isLoading ? (
            <TableSkeleton rows={10} cols={2} />
          ) : sorted.length === 0 ? (
            <EmptyState title="Tidak ada data" />
          ) : (
            <div className="space-y-2">
              {sorted.slice(0, 10).map((it) => (
                <div
                  key={it.item_id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{it.sku}</p>
                  </div>
                  <span className="text-sm font-semibold">{formatIDR(nilaiFor(it, method))}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Perbandingan Metode" description="Nilai persediaan aktual dari kartu stock">
          {isLoading ? (
            <TableSkeleton rows={3} cols={2} />
          ) : (
            <div className="space-y-3">
              {valuationMethods.map((m) => {
                const v = totalByMethod[m];
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
                          width: `${(v / maxMethodTotal) * 100}%`,
                          backgroundImage: "var(--gradient-primary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
