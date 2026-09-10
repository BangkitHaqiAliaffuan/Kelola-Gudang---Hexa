import { useMemo, useState } from "react";
import {
  Download,
  Flame,
  Package,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterCombobox,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TableSkeleton,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useLaporanFastMoving } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { FastMovingRowApi } from "@/lib/persediaan-types";

const RISIKO_OPTIONS = [
  { value: ALL, label: "Semua Risiko" },
  { value: "Habis", label: "Habis" },
  { value: "Kritis", label: "Kritis" },
  { value: "Menipis", label: "Menipis" },
  { value: "Aman", label: "Aman" },
] as const;

type RisikoFilter = (typeof RISIKO_OPTIONS)[number]["value"];

const PRESETS = [
  { value: 30, label: "30 hari" },
  { value: 60, label: "60 hari" },
  { value: 90, label: "90 hari" },
] as const;

const risikoTone = (r: string): Tone =>
  r === "Habis" || r === "Kritis" ? "danger" : r === "Menipis" ? "warning" : "success";

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

export function LaporanFastMoving() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [cat, setCat] = useState(ALL);
  const [risiko, setRisiko] = useState<RisikoFilter>(ALL);
  const [preset, setPreset] = useState<number>(30);
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [from, setFrom] = useState(() => shiftDays(toISODate(new Date()), -29));

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const whFilter = useWarehouseFilter(warehouses?.data);

  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);

  const applyPreset = (days: number) => {
    setPreset(days);
    setTo(toISODate(new Date()));
    setFrom(shiftDays(toISODate(new Date()), -(days - 1)));
  };

  const hasActiveFilters = useMemo(
    () =>
      q !== "" ||
      whFilter.value !== ALL ||
      cat !== ALL ||
      risiko !== ALL ||
      preset !== 30 ||
      from !== shiftDays(toISODate(new Date()), -29) ||
      to !== toISODate(new Date()),
    [q, whFilter.value, cat, risiko, preset, from, to],
  );
  const handleClearFilters = () => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
    setRisiko(ALL);
    applyPreset(30);
  };

  const { data, isLoading, error, refetch } = useLaporanFastMoving({
    from,
    to,
    warehouseId: whFilter.warehouseId,
    categoryId: cat === ALL ? null : (catId ?? null),
    search: debouncedQ.trim() || null,
  });

  // Backend memfilter hanya item yang keluar di periode; rank = urut qty desc.
  const rows = useMemo(() => {
    const all = [...(data?.data ?? [])].sort((a, b) => b.keluar_qty - a.keluar_qty);
    if (risiko === ALL) return all;
    return all.filter((r) => r.risiko === risiko);
  }, [data, risiko]);

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const stats = useMemo(() => {
    const qty = rows.reduce((a, b) => a + b.keluar_qty, 0);
    const nilai = rows.reduce((a, b) => a + b.nilai_keluar, 0);
    const reorder = rows.filter((r) => r.butuh_reorder).length;
    const kritis = rows.filter((r) => r.risiko === "Habis" || r.risiko === "Kritis").length;
    return { qty, nilai, reorder, kritis };
  }, [rows]);

  const handleExport = () => {
    const content = toCsv(
      rows.map((r, i) => ({
        rank: i + 1,
        sku: r.sku ?? "",
        name: r.name ?? "",
        category: r.category ?? "",
        unit: r.unit ?? "",
        keluar_qty: r.keluar_qty,
        frekuensi: r.frekuensi,
        adu: r.adu,
        days_of_cover: r.days_of_cover ?? "—",
        tersedia: r.tersedia,
        reserved: r.reserved,
        nilai_keluar: r.nilai_keluar,
        prev_qty: r.prev_qty,
        trend_pct: r.trend_pct ?? "—",
        risiko: r.risiko,
        butuh_reorder: r.butuh_reorder ? "Ya" : "Tidak",
      })),
      [
        { key: "rank", label: "Rank" },
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "category", label: "Kategori" },
        { key: "unit", label: "Satuan" },
        { key: "keluar_qty", label: "Keluar" },
        { key: "frekuensi", label: "Frekuensi" },
        { key: "adu", label: "ADU" },
        { key: "days_of_cover", label: "Cover (hari)" },
        { key: "tersedia", label: "Tersedia" },
        { key: "reserved", label: "Reserved" },
        { key: "nilai_keluar", label: "Nilai Keluar" },
        { key: "prev_qty", label: "Periode Lalu" },
        { key: "trend_pct", label: "Tren %" },
        { key: "risiko", label: "Risiko" },
        { key: "butuh_reorder", label: "Butuh Reorder" },
      ],
    );
    downloadCsv(`laporan-fast-moving-${from}-${to}.csv`, content);
    toast.success(`Export ${formatNumber(rows.length)} baris`);
  };

  const trendCell = (r: FastMovingRowApi) => {
    if (r.trend_pct == null) return <span className="text-muted-foreground">—</span>;
    const up = r.trend_pct > 0;
    const flat = r.trend_pct === 0;
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold ${up ? "text-emerald-600" : flat ? "text-muted-foreground" : "text-rose-500"}`}
      >
        {up ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : flat ? null : (
          <TrendingDown className="h-3.5 w-3.5" />
        )}
        {up ? "+" : ""}
        {r.trend_pct}%
      </span>
    );
  };

  const columns: Column<FastMovingRowApi & { rank: number }>[] = [
    {
      key: "rank",
      label: "#",
      className: "w-[52px] text-right",
      sortable: true,
      render: (r) => <b>#{r.rank}</b>,
    },
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
      key: "keluar_qty",
      label: "Keluar",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <b>
          {formatNumber(r.keluar_qty)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "adu",
      label: "ADU/hari",
      className: "text-right w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.adu),
    },
    {
      key: "days_of_cover",
      label: "Cover",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.days_of_cover ?? 999999,
      render: (r) =>
        r.days_of_cover == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <b>{formatNumber(r.days_of_cover)} hari</b>
            {r.butuh_reorder && <Pill tone="warning">reorder</Pill>}
          </span>
        ),
    },
    {
      key: "tersedia",
      label: "Tersedia",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <b>
          {formatNumber(r.tersedia)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "trend",
      label: "Tren",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.trend_pct ?? -999999,
      render: (r) => trendCell(r),
    },
    {
      key: "risiko",
      label: "Risiko",
      className: "w-[110px]",
      sortable: true,
      render: (r) => <Pill tone={risikoTone(r.risiko)}>{r.risiko}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Laporan Fast Moving Item"
        description={`Pergerakan keluar ${from} – ${to} · konsumsi nyata (Pengeluaran)`}
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
          label="Qty Keluar Periode"
          value={isLoading ? "…" : formatNumber(stats.qty)}
          {...(isLoading ? {} : { hint: `${formatNumber(rows.length)} item bergerak` })}
          icon={Flame}
          tone="brand"
        />
        <StatCard
          loading={isLoading}
          label="Nilai Keluar"
          value={isLoading ? "…" : formatIDRCompact(stats.nilai)}
          {...(isLoading
            ? {}
            : { valueTitle: formatIDR(stats.nilai), hint: "nilai pokok persediaan" })}
          icon={Package}
          tone="info"
        />
        <StatCard
          loading={isLoading}
          label="Butuh Reorder"
          value={isLoading ? "…" : formatNumber(stats.reorder)}
          {...(isLoading ? {} : { hint: "cover ≤ lead time" })}
          icon={ShoppingCart}
          tone="warning"
        />
        <StatCard
          loading={isLoading}
          label="Habis / Kritis"
          value={isLoading ? "…" : formatNumber(stats.kritis)}
          {...(isLoading ? {} : { hint: "segera tindak lanjuti" })}
          icon={Flame}
          tone="danger"
        />
      </div>

      <Panel title="Filter">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Periode:</span>
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => applyPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid items-start gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari barang, SKU..."
              className="rounded-xl pl-9"
            />
          </div>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset(0);
            }}
            className="rounded-xl"
          />
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset(0);
            }}
            className="rounded-xl"
          />
          <FilterCombobox
            className="w-full"
            value={cat}
            onChange={setCat}
            placeholder="Semua Kategori"
            options={categoryNames}
            loading={catsLoading}
          />
        </div>
        <div className="mt-3 grid items-start gap-3 md:grid-cols-4">
          <FilterSelect
            className="w-full"
            value={risiko}
            onChange={(v) => setRisiko(v as RisikoFilter)}
            placeholder="Risiko"
            options={[...RISIKO_OPTIONS]}
          />
          <FilterCombobox
            className="w-full"
            value={whFilter.value}
            onChange={whFilter.onChange}
            placeholder="Semua Gudang"
            options={warehouseNames}
            loading={warehousesLoading}
          />
          <div className="flex items-start md:col-span-2">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Peringkat Fast Moving"
        description={`${formatNumber(rows.length)} barang · urut qty keluar terbanyak`}
      >
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows.map((r, i) => ({ ...r, rank: i + 1 }))}
            pageSize={12}
            loading={isLoading}
            error={error}
            onRetry={() => refetch()}
            initialSort={{ key: "rank", dir: "asc" }}
            mobileCard={(r) => (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">
                    #{r.rank} {r.name ?? "—"}
                  </p>
                  <Pill tone={risikoTone(r.risiko)}>{r.risiko}</Pill>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.sku ?? "—"} · {r.category ?? "—"}
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Keluar</p>
                    <b>
                      {formatNumber(r.keluar_qty)} {r.unit ?? ""}
                    </b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cover</p>
                    <b>{r.days_of_cover == null ? "—" : `${formatNumber(r.days_of_cover)} hari`}</b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tren</p>
                    <b>
                      {r.trend_pct == null ? "—" : `${r.trend_pct > 0 ? "+" : ""}${r.trend_pct}%`}
                    </b>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </Panel>
    </>
  );
}
