import { useMemo, useState } from "react";
import { Download, PackageX, Search, CalendarClock, BarChart3, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TableSkeleton,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { DeadStockSheet } from "@/components/wms/dead-stock-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useStockValuation } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { StockValuationApi } from "@/lib/persediaan-types";

const AGE_BUCKETS = [
  { value: ALL, label: "Semua Umur" },
  { value: "150-180", label: "150–180 hari" },
  { value: "180-365", label: "180–365 hari" },
  { value: "365+", label: "> 365 hari" },
] as const;

type AgeBucket = (typeof AGE_BUCKETS)[number]["value"];

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86_400_000);
}

function ageBucket(days: number): "150-180" | "180-365" | "365+" {
  if (days <= 180) return "150-180";
  if (days <= 365) return "180-365";
  return "365+";
}

const ageBucketTone = (bucket: string): Tone =>
  bucket === "150-180" ? "warning" : bucket === "180-365" ? "danger" : "neutral";

export function LaporanDeadStock() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [cat, setCat] = useState(ALL);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const whFilter = useWarehouseFilter(warehouses?.data);

  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);

  const hasActiveFilters = useMemo(
    () => q !== "" || whFilter.value !== ALL || cat !== ALL || ageFilter !== ALL,
    [q, whFilter.value, cat, ageFilter],
  );
  const handleClearFilters = () => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
    setAgeFilter(ALL);
  };

  const { data, isLoading, error, refetch } = useStockValuation({
    warehouseId: whFilter.warehouseId,
    categoryId: cat === ALL ? null : (catId ?? null),
    search: debouncedQ.trim() || null,
    moving: "Dead",
  });

  // Hanya item Dead berstok > 0 yang relevan untuk keputusan (obral, retur ke
  // supplier, mutasi, write-off). Stok 0 = tidak ada modal tertanam.
  // Filter client-side selalu diterapkan (truth); param moving di atas
  // menyempitkan hasil di server setelah backend mendukungnya.
  const deadRows = useMemo(
    () => (data?.data ?? []).filter((r) => r.moving === "Dead" && r.stock > 0),
    [data],
  );

  // Filter umur (bucket) client-side — backend tidak punya field daysAgo.
  const rows = useMemo(() => {
    if (ageFilter === ALL) return deadRows;
    return deadRows.filter((r) => {
      const days = daysSince(r.last_move_at);
      return ageBucket(days) === ageFilter;
    });
  }, [deadRows, ageFilter]);

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const selected = useMemo(
    () => deadRows.find((it) => it.item_id === selectedId) ?? null,
    [deadRows, selectedId],
  );

  const stats = useMemo(() => {
    const totalStockAll = deadRows.reduce((a, b) => a + b.stock, 0);
    const totalValueAll = deadRows.reduce((a, b) => a + b.nilai_fifo, 0);
    const deadQty = rows.reduce((a, b) => a + b.stock, 0);
    const deadValue = rows.reduce((a, b) => a + b.nilai_fifo, 0);
    const deadPct = deadRows.length > 0 ? (rows.length / deadRows.length) * 100 : 0;
    const avgDays =
      rows.length > 0
        ? Math.round(
            rows.reduce((a, b) => a + Math.min(daysSince(b.last_move_at), 9999), 0) / rows.length,
          )
        : 0;
    return { deadQty, deadValue, deadPct, avgDays, totalStockAll, totalValueAll };
  }, [rows, deadRows]);

  const handleExport = () => {
    const content = toCsv(
      rows.map((r) => {
        const days = daysSince(r.last_move_at);
        return {
          sku: r.sku ?? "",
          name: r.name ?? "",
          category: r.category ?? "",
          unit: r.unit ?? "",
          stock: r.stock,
          reserved: r.reserved,
          nilai_fifo: r.nilai_fifo,
          days_no_movement: days === Infinity ? "Tidak pernah" : days,
          age_bucket: ageBucket(days),
          last_move_at: r.last_move_at ?? "Tidak pernah",
        };
      }),
      [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "category", label: "Kategori" },
        { key: "unit", label: "Satuan" },
        { key: "stock", label: "Stok" },
        { key: "reserved", label: "Reserved" },
        { key: "nilai_fifo", label: "Nilai (FIFO)" },
        { key: "days_no_movement", label: "Hari Tanpa Transaksi" },
        { key: "age_bucket", label: "Kategori Umur" },
        { key: "last_move_at", label: "Terakhir Bergerak" },
      ],
    );
    downloadCsv(`laporan-dead-stock-${new Date().toISOString().slice(0, 10)}.csv`, content);
    toast.success(`Export ${formatNumber(rows.length)} baris`);
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
      render: (r) => (
        <b>
          {formatNumber(r.stock)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "nilai",
      label: "Nilai (FIFO)",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.nilai_fifo,
      render: (r) => formatIDR(r.nilai_fifo),
    },
    {
      key: "days",
      label: "Hari Tanpa Transaksi",
      className: "text-right w-[170px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => Math.min(daysSince(r.last_move_at), 9999),
      render: (r) => {
        const days = daysSince(r.last_move_at);
        const label = days === Infinity ? "Tidak pernah" : `${formatNumber(days)} hari`;
        const bucket = days === Infinity ? "365+" : ageBucket(days);
        return (
          <span className="inline-flex items-center gap-1.5">
            {label}
            <Pill tone={ageBucketTone(bucket)}>{bucket}</Pill>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div>
        <PageHeader
          title="Laporan Barang Tidak Bergerak (Dead Stock)"
          description="Barang tanpa transaksi lebih dari 150 hari"
          actions={
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            loading={isLoading}
            label="Total Dead Stock"
            value={isLoading ? "…" : formatNumber(stats.deadQty)}
            {...(isLoading ? {} : { hint: `${formatNumber(rows.length)} item tidak bergerak` })}
            icon={PackageX}
            tone="danger"
          />
          <StatCard
            loading={isLoading}
            label="Total Nilai Dead Stock"
            value={isLoading ? "…" : formatIDRCompact(stats.deadValue)}
            {...(isLoading ? {} : { valueTitle: formatIDR(stats.deadValue), hint: "metode FIFO" })}
            icon={TrendingDown}
            tone="danger"
          />
          <StatCard
            loading={isLoading}
            label="Persentase Dead"
            value={isLoading ? "…" : `${stats.deadPct.toFixed(1)}%`}
            {...(isLoading
              ? {}
              : {
                  hint: `${formatNumber(rows.length)} dari ${formatNumber(deadRows.length)} item dead`,
                })}
            icon={BarChart3}
            tone="warning"
          />
          <StatCard
            loading={isLoading}
            label="Rata-rata Umur Dead"
            value={isLoading ? "…" : `${formatNumber(stats.avgDays)} hari`}
            {...(isLoading ? {} : { hint: "sejak transaksi terakhir" })}
            icon={CalendarClock}
            tone="info"
          />
        </div>

        <Panel title="Filter">
          <div className="grid items-start gap-3 md:grid-cols-5">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari barang, SKU..."
                className="rounded-xl pl-9"
              />
            </div>
            <FilterSelect
              className="w-full"
              value={whFilter.value}
              onChange={whFilter.onChange}
              placeholder="Semua Gudang"
              options={warehouseNames}
              loading={warehousesLoading}
            />
            <FilterSelect
              className="w-full"
              value={cat}
              onChange={setCat}
              placeholder="Semua Kategori"
              options={categoryNames}
              loading={catsLoading}
            />
            <FilterSelect
              className="w-full"
              value={ageFilter}
              onChange={(v) => setAgeFilter(v as AgeBucket)}
              placeholder="Kategori Umur"
              options={[...AGE_BUCKETS]}
            />
            <div className="flex items-start">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
          {whFilter.value !== ALL && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Stok & status hanya berdasarkan aktivitas di gudang ini
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Daftar Dead Stock"
        description={`${formatNumber(rows.length)} barang · tanpa transaksi > 150 hari`}
      >
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            pageSize={12}
            loading={isLoading}
            error={error}
            onRetry={() => refetch()}
            onRowClick={(r) => setSelectedId(r.item_id)}
            initialSort={{ key: "days", dir: "desc" }}
            mobileCard={(r) => {
              const days = daysSince(r.last_move_at);
              const bucket = days === Infinity ? "365+" : ageBucket(days);
              return (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                    <Pill tone={ageBucketTone(bucket)}>{bucket}</Pill>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.sku ?? "—"} · {r.category ?? "—"}
                  </p>
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Stok</p>
                      <b>
                        {formatNumber(r.stock)} {r.unit ?? ""}
                      </b>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Nilai</p>
                      <b>{formatIDR(r.nilai_fifo)}</b>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Hari</p>
                      <b>{days === Infinity ? "—" : formatNumber(days)}</b>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </Panel>

      <DeadStockSheet item={selected} onOpenChange={(o) => !o && setSelectedId(null)} />
    </>
  );
}
