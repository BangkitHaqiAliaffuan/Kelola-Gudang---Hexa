import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Hourglass,
  Search,
  ShoppingCart,
  TriangleAlert,
  Wallet,
  TrendingUp,
  TrendingDown,
  PackageX,
  Zap,
  Lock,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TableSkeleton,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useCategories, useCostDrift, useWarehouses } from "@/hooks/use-master";
import { useStockMinimum, useStockValuation } from "@/hooks/use-persediaan";
import {
  stockMovingTypes,
  valuationMethodLabels,
  type StockValuationApi,
} from "@/lib/persediaan-types";
import { downloadCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  formatIDR,
  formatIDRCompact,
  formatNumber,
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

// Klasifikasi ABC (Pareto 80/20) atas nilai kini: A ≈ 80% nilai pertama,
// B hingga 95%, sisanya C. Dihitung client-side dari baris yang tampil.
type AbcClass = "A" | "B" | "C";

const ABC_OPTIONS = [
  { value: "A", label: "Kelas A — penopang nilai" },
  { value: "B", label: "Kelas B — menengah" },
  { value: "C", label: "Kelas C — ekor panjang" },
] as const;

const abcTone = (c: AbcClass) => (c === "A" ? "brand" : c === "B" ? "info" : "neutral");

const DRIFT_THRESHOLD_PCT = 10;

function NilaiPersediaan() {
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [cat, setCat] = useState(ALL);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [moving, setMoving] = useState(ALL);
  const [abc, setAbc] = useState(ALL);

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;

  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || cat !== ALL || moving !== ALL || abc !== ALL,
    [q, wh, cat, moving, abc],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
    setMoving(ALL);
    setAbc(ALL);
  }, [whFilter]);

  const whId = whFilter.warehouseId;
  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);

  const { data, isLoading, error, refetch } = useStockValuation({
    warehouseId: whId,
    categoryId: cat === ALL ? null : (catId ?? null),
    search: debouncedQ.trim() || null,
  });

  // Join operasional per item_id: batas minimum/ADU/cover + sinyal cost drift.
  const { data: minData } = useStockMinimum({
    days: 30,
    warehouseId: whId,
    categoryId: cat === ALL ? null : (catId ?? null),
  });
  const { data: driftData } = useCostDrift(DRIFT_THRESHOLD_PCT);

  const rows = useMemo(() => data?.data ?? [], [data]);

  const minById = useMemo(
    () => new Map((minData?.data ?? []).map((m) => [m.item_id, m])),
    [minData],
  );
  const driftById = useMemo(
    () => new Map((driftData?.data ?? []).map((d) => [d.item_id, d.drift_pct])),
    [driftData],
  );

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
  const slow = rows.filter((i) => i.moving === "Slow");
  const fast = rows.filter((i) => i.moving === "Fast");

  // Kelas ABC stabil per cakupan server (rows) + metode aktif.
  const abcById = useMemo(() => {
    const map = new Map<number, AbcClass>();
    const ranked = [...rows].sort((a, b) => nilaiFor(b, method) - nilaiFor(a, method));
    const grand = ranked.reduce((s, r) => s + nilaiFor(r, method), 0);
    if (grand <= 0) {
      ranked.forEach((r) => map.set(r.item_id, "C"));
      return map;
    }
    let cum = 0;
    for (const r of ranked) {
      cum += nilaiFor(r, method);
      const share = cum / grand;
      map.set(r.item_id, share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C");
    }
    return map;
  }, [rows, method]);

  const abcDist = useMemo(
    () =>
      (["A", "B", "C"] as AbcClass[]).map((c) => {
        const list = rows.filter((r) => abcById.get(r.item_id) === c);
        return {
          kelas: c,
          sku: list.length,
          nilai: list.reduce((s, r) => s + nilaiFor(r, method), 0),
        };
      }),
    [rows, abcById, method],
  );

  // Modal tertahan (Dead + Slow) dan kebutuhan replenishment dalam Rupiah.
  const stuckValue = useMemo(
    () =>
      rows
        .filter((r) => r.moving === "Dead" || r.moving === "Slow")
        .reduce((s, r) => s + nilaiFor(r, method), 0),
    [rows, method],
  );
  const stuckShare = total > 0 ? (stuckValue / total) * 100 : 0;

  const replenish = useMemo(() => {
    let rp = 0;
    let sku = 0;
    for (const r of rows) {
      const sug = minById.get(r.item_id)?.suggested_qty ?? 0;
      if (sug > 0) {
        rp += sug * unitCostFor(r, method);
        sku += 1;
      }
    }
    return { rp, sku };
  }, [rows, minById, method]);

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

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (moving === ALL || r.moving === moving) &&
          (abc === ALL || (abcById.get(r.item_id) ?? "C") === abc),
      ),
    [rows, moving, abc, abcById],
  );

  const movingTone = (m: StockValuationApi["moving"]) =>
    m === "Dead" ? "danger" : m === "Slow" ? "warning" : m === "Medium" ? "info" : "success";

  const handleExport = () => {
    const content = toCsv(
      filteredRows.map((r) => ({
        sku: r.sku ?? "",
        name: r.name ?? "",
        category: r.category ?? "",
        unit: r.unit ?? "",
        stock: r.stock,
        reserved: r.reserved,
        available: r.available,
        days_of_cover: minById.get(r.item_id)?.days_of_cover ?? "",
        suggested_qty: minById.get(r.item_id)?.suggested_qty ?? 0,
        unit_cost: unitCostFor(r, method),
        nilai: nilaiFor(r, method),
        moving: r.moving,
        abc_class: abcById.get(r.item_id) ?? "C",
        drift_pct: driftById.get(r.item_id) ?? "",
      })),
      [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "category", label: "Kategori" },
        { key: "unit", label: "Satuan" },
        { key: "stock", label: "Stok" },
        { key: "reserved", label: "Reserved" },
        { key: "available", label: "Available" },
        { key: "days_of_cover", label: "Days of Cover" },
        { key: "suggested_qty", label: "Saran Beli" },
        { key: "unit_cost", label: `HPP ${valuationMethodLabels[method]}` },
        { key: "nilai", label: `Nilai ${valuationMethodLabels[method]}` },
        { key: "moving", label: "Moving" },
        { key: "abc_class", label: "Kelas ABC" },
        { key: "drift_pct", label: "Drift HPP (%)" },
      ],
    );
    downloadCsv(
      `nilai-persediaan-${method.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
    );
    toast.success(`Export ${formatNumber(filteredRows.length)} baris`);
  };

  const columns: Column<StockValuationApi>[] = [
    {
      key: "name",
      label: "Barang",
      className: "min-w-[200px]",
      sortable: true,
      render: (r) => {
        const drift = driftById.get(r.item_id);
        const drifted = drift != null && Math.abs(drift) >= DRIFT_THRESHOLD_PCT;
        return (
          <span className="block max-w-[240px]">
            <span className="block truncate font-medium" title={r.name ?? ""}>
              {r.name ?? "—"}
            </span>
            {drifted && (
              <span
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-warning"
                title={`HPP ${valuationMethodLabels[method]} menyimpang ${drift}% dari HPP master — cek harga beli terakhir`}
              >
                <TriangleAlert className="h-3 w-3" /> Drift {drift}%
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "sku",
      label: "SKU",
      className: "w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span>,
    },
    {
      key: "category",
      label: "Kategori",
      className: "min-w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.category ?? "—",
    },
    {
      key: "abc",
      label: "ABC",
      className: "w-[70px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => abcById.get(r.item_id) ?? "C",
      render: (r) => {
        const c = abcById.get(r.item_id) ?? "C";
        return <Pill tone={abcTone(c) as never}>{c}</Pill>;
      },
    },
    {
      key: "stock",
      label: "Stok",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.stock),
    },
    {
      key: "available",
      label: "Available",
      className: "text-right w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.available),
    },
    {
      key: "cover",
      label: "Cover",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => minById.get(r.item_id)?.days_of_cover ?? -1,
      render: (r) => {
        const cover = minById.get(r.item_id)?.days_of_cover;
        return (
          <span
            className="inline-flex items-center gap-1"
            title={
              cover == null
                ? "Tanpa pemakaian 30 hari — cover tak terhingga"
                : `Stok bertahan ±${cover} hari pada laju pakai 30 hari`
            }
          >
            <CalendarClock className="h-3 w-3 text-muted-foreground" />
            {cover == null ? "—" : `${cover} hr`}
          </span>
        );
      },
    },
    {
      key: "unit_cost",
      label: `HPP ${valuationMethodLabels[method]}`,
      className: "text-right min-w-[120px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => unitCostFor(r, method),
      render: (r) => formatIDR(unitCostFor(r, method)),
    },
    {
      key: "nilai",
      label: `Nilai ${valuationMethodLabels[method]}`,
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => nilaiFor(r, method),
      render: (r) => formatIDR(nilaiFor(r, method)),
    },
    {
      key: "moving",
      label: "Moving",
      className: "w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={movingTone(r.moving) as never}>{r.moving}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Nilai Persediaan"
        description="Kokpit operasional: nilai kini per metode, klasifikasi ABC, dan sinyal aksi (cover, drift, replenishment)"
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari barang atau SKU..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={wh}
            onChange={whFilter.onChange}
            placeholder="Semua Gudang"
            options={warehouseNames}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={cat}
            onChange={setCat}
            placeholder="Semua Kategori"
            options={categoryNames}
            loading={catsLoading}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={moving}
            onChange={setMoving}
            placeholder="Semua Moving"
            options={[...stockMovingTypes]}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={abc}
            onChange={setAbc}
            placeholder="Semua Kelas ABC"
            options={[...ABC_OPTIONS]}
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          loading={isLoading}
          label="Total Nilai Stock"
          value={isLoading ? "…" : formatIDRCompact(total)}
          {...(isLoading
            ? {}
            : { valueTitle: formatIDR(total), hint: `metode ${valuationMethodLabels[method]}` })}
          icon={Wallet}
        />
        <StatCard
          loading={isLoading}
          label="Barang Termahal"
          value={isLoading ? "…" : formatIDRCompact(termahal ? nilaiFor(termahal, method) : 0)}
          {...(isLoading
            ? {}
            : {
                valueTitle: formatIDR(termahal ? nilaiFor(termahal, method) : 0),
                hint: termahal?.name ?? "—",
              })}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          loading={isLoading}
          label="Barang Termurah"
          value={isLoading ? "…" : formatIDRCompact(termurah ? nilaiFor(termurah, method) : 0)}
          {...(isLoading
            ? {}
            : {
                valueTitle: formatIDR(termurah ? nilaiFor(termurah, method) : 0),
                hint: termurah?.name ?? "—",
              })}
          icon={TrendingDown}
          tone="info"
        />
        <StatCard
          loading={isLoading}
          label="Dead Stock"
          value={isLoading ? "…" : String(dead.length)}
          {...(isLoading ? {} : { hint: "tidak bergerak > 5 bulan" })}
          icon={PackageX}
          tone="danger"
        />
        <StatCard
          loading={isLoading}
          label="Fast Moving"
          value={isLoading ? "…" : String(fast.length)}
          {...(isLoading ? {} : { hint: "bergerak < 20 hari" })}
          icon={Zap}
          tone="warning"
        />
        <StatCard
          loading={isLoading}
          label="Nilai Tereservasi"
          value={isLoading ? "…" : formatIDRCompact(nilaiReserved)}
          {...(isLoading
            ? {}
            : { valueTitle: formatIDR(nilaiReserved), hint: "terikat reservasi" })}
          icon={Lock}
          tone="info"
        />
        <StatCard
          loading={isLoading}
          label="Modal Tertahan"
          value={isLoading ? "…" : formatIDRCompact(stuckValue)}
          {...(isLoading
            ? {}
            : {
                valueTitle: formatIDR(stuckValue),
                hint: `${stuckShare.toFixed(1)}% dari total · Dead + Slow`,
              })}
          icon={Hourglass}
          tone="danger"
        />
        <StatCard
          loading={isLoading}
          label="Butuh Replenishment"
          value={isLoading ? "…" : formatIDRCompact(replenish.rp)}
          {...(isLoading
            ? {}
            : {
                valueTitle: formatIDR(replenish.rp),
                hint: `${formatNumber(replenish.sku)} SKU di bawah batas`,
              })}
          icon={ShoppingCart}
          tone="warning"
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
        <Panel
          title="10 Barang Nilai Tertinggi"
          {...(total > 0 ? { description: "Persen = porsi terhadap total nilai" } : {})}
        >
          {isLoading ? (
            <TableSkeleton rows={10} cols={2} />
          ) : sorted.length === 0 ? (
            <EmptyState title="Tidak ada data" />
          ) : (
            <div className="space-y-2">
              {sorted.slice(0, 10).map((it) => {
                const v = nilaiFor(it, method);
                const share = total > 0 ? (v / total) * 100 : 0;
                return (
                  <div
                    key={it.item_id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{it.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatIDR(v)}</p>
                      <p className="text-xs text-muted-foreground">{share.toFixed(1)}%</p>
                    </div>
                  </div>
                );
              })}
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

      <Panel
        title={`Konsentrasi Nilai (ABC) — ${valuationMethodLabels[method]}`}
        description="A ≈ 80% nilai pertama · B hingga 95% · C ekor panjang — fokuskan cycle count & pengaman stok pada kelas A"
      >
        {isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : (
          <div className="space-y-3">
            {abcDist.map((d) => {
              const share = total > 0 ? (d.nilai / total) * 100 : 0;
              return (
                <div key={d.kelas} className="rounded-xl border border-border p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      <Pill tone={abcTone(d.kelas) as never}>Kelas {d.kelas}</Pill>{" "}
                      <span className="text-muted-foreground">
                        {formatNumber(d.sku)} SKU · {share.toFixed(1)}% nilai
                      </span>
                    </p>
                    <Pill tone="neutral">{formatIDR(d.nilai)}</Pill>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${share}%`,
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

      <Panel
        title="Daftar Nilai Persediaan"
        description={`${formatNumber(filteredRows.length)} barang · metode ${valuationMethodLabels[method]}`}
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleExport}
            disabled={filteredRows.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" /> Export
          </Button>
        }
      >
        <DataTable
          columns={columns}
          rows={filteredRows}
          pageSize={12}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          initialSort={{ key: "nilai", dir: "desc" }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <span className="inline-flex items-center gap-1">
                  <Pill tone={abcTone(abcById.get(r.item_id) ?? "C") as never}>
                    {abcById.get(r.item_id) ?? "C"}
                  </Pill>
                  <Pill tone={movingTone(r.moving) as never}>{r.moving}</Pill>
                </span>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {r.sku ?? "—"} · {r.category ?? "—"}
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Stok</p>
                  <b>{formatNumber(r.stock)}</b>
                </div>
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <b>{formatNumber(r.available)}</b>
                </div>
                <div>
                  <p className="text-muted-foreground">Moving</p>
                  <b>{r.moving}</b>
                </div>
              </div>
              <p className="text-xs">
                HPP: <b>{formatIDR(unitCostFor(r, method))}</b> · Nilai:{" "}
                <b>{formatIDR(nilaiFor(r, method))}</b>
              </p>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
