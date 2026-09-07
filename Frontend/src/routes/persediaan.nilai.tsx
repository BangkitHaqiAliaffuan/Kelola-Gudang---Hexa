import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Search,
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
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useStockValuation } from "@/hooks/use-persediaan";
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

function NilaiPersediaan() {
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [cat, setCat] = useState(ALL);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [moving, setMoving] = useState(ALL);

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;

  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || cat !== ALL || moving !== ALL,
    [q, wh, cat, moving],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
    setMoving(ALL);
  }, [whFilter]);

  const whId = whFilter.warehouseId;
  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);

  const { data, isLoading } = useStockValuation({
    warehouseId: whId,
    categoryId: cat === ALL ? null : (catId ?? null),
    search: debouncedQ.trim() || null,
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

  const filteredRows = useMemo(
    () => rows.filter((r) => moving === ALL || r.moving === moving),
    [rows, moving],
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
        unit_cost: unitCostFor(r, method),
        nilai: nilaiFor(r, method),
        moving: r.moving,
      })),
      [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "category", label: "Kategori" },
        { key: "unit", label: "Satuan" },
        { key: "stock", label: "Stok" },
        { key: "reserved", label: "Reserved" },
        { key: "available", label: "Available" },
        { key: "unit_cost", label: `HPP ${valuationMethodLabels[method]}` },
        { key: "nilai", label: `Nilai ${valuationMethodLabels[method]}` },
        { key: "moving", label: "Moving" },
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
      render: (r) => (
        <span className="block max-w-[240px] truncate font-medium" title={r.name ?? ""}>
          {r.name ?? "—"}
        </span>
      ),
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
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          initialSort={{ key: "nilai", dir: "desc" }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <Pill tone={movingTone(r.moving) as never}>{r.moving}</Pill>
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
