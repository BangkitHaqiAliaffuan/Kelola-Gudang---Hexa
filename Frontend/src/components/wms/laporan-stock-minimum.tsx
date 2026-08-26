import { useMemo, useState } from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  Search,
  TriangleAlert,
  PackageX,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { StockMinimumSheet } from "@/components/wms/stock-minimum-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useStockMinimum } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { StockMinimumApi, StockMinimumStatus } from "@/lib/persediaan-types";

const DAYS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "14", label: "14 hari" },
  { value: "30", label: "30 hari" },
  { value: "60", label: "60 hari" },
  { value: "90", label: "90 hari" },
];
const DEFAULT_DAYS = 30;
const severityOptions = ["Habis", "Kritis", "Menipis"] as const;
const FS_HIDDEN_COLUMNS = new Set(["available", "lead"]);
const statusTone: Record<StockMinimumStatus, Tone> = {
  Habis: "danger",
  Kritis: "danger",
  Menipis: "warning",
  Normal: "success",
};
const statusLabel: Record<StockMinimumStatus, string> = {
  Habis: "Habis",
  Kritis: "Kritis",
  Menipis: "Menipis",
  Normal: "Normal",
};

export function LaporanStockMinimum() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [severity, setSeverity] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const whId = useMemo(() => warehouses?.data.find((w) => w.name === wh)?.id, [warehouses, wh]);
  const catId = useMemo(() => cats?.data.find((c) => c.name === cat)?.id, [cats, cat]);
  const { data, isLoading } = useStockMinimum({
    days: days === ALL ? DEFAULT_DAYS : Number(days),
    warehouseId: wh === ALL ? null : (whId ?? null),
    categoryId: cat === ALL ? null : (catId ?? null),
  });

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (it) =>
          (!debouncedQ ||
            `${it.name ?? ""} ${it.sku ?? ""} ${it.supplier ?? ""}`
              .toLowerCase()
              .includes(debouncedQ.toLowerCase())) &&
          (severity === ALL || it.status === severity),
      ),
    [data, debouncedQ, severity],
  );

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);
  const selected = useMemo(
    () => (data?.data ?? []).find((it) => it.id === selectedId) ?? null,
    [data, selectedId],
  );

  const stats = useMemo(() => {
    const need = rows.filter((r) => r.status !== "Normal");
    return {
      perlu: need.length,
      nilai: need.reduce((sum, r) => sum + r.suggested_qty * r.cost, 0),
      habis: rows.filter((r) => r.status === "Habis").length,
      suppliers: new Set(need.map((r) => r.supplier).filter(Boolean)).size,
    };
  }, [rows]);

  const handleExport = () => {
    const content = toCsv(
      rows.map((r) => ({
        name: r.name,
        sku: r.sku,
        category: r.category,
        supplier: r.supplier,
        unit: r.unit,
        stock: r.total_stock,
        available: r.available,
        reserved: r.reserved,
        min: r.min,
        max: r.max,
        avg_daily_usage: r.avg_daily_usage,
        days_of_cover: r.days_of_cover,
        lead_time: r.lead_time,
        suggested_qty: r.suggested_qty,
        status: r.status,
      })),
      [
        { key: "name", label: "Barang" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Kategori" },
        { key: "supplier", label: "Supplier" },
        { key: "unit", label: "Satuan" },
        { key: "stock", label: "Stok Total" },
        { key: "available", label: "Tersedia" },
        { key: "reserved", label: "Reserved" },
        { key: "min", label: "Minimum" },
        { key: "max", label: "Maksimum" },
        { key: "avg_daily_usage", label: "Pemakaian/Hari" },
        { key: "days_of_cover", label: "Hari Sisa" },
        { key: "lead_time", label: "Lead Time (hari)" },
        { key: "suggested_qty", label: "Usulan Restock" },
        { key: "status", label: "Status" },
      ],
    );
    downloadCsv(`laporan-stock-minimum-${new Date().toISOString().slice(0, 10)}.csv`, content);
    toast.success(`Export ${formatNumber(rows.length)} baris`);
  };

  const columns: Column<StockMinimumApi>[] = [
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
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.total_stock,
      render: (r) => (
        <b>
          {formatNumber(r.total_stock)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "available",
      label: "Tersedia",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => `${formatNumber(r.available)} ${r.unit ?? ""}`,
    },
    {
      key: "min",
      label: "Minimum",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.min),
    },
    {
      key: "adu",
      label: "ADU",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.avg_daily_usage,
      render: (r) => formatNumber(r.avg_daily_usage),
    },
    {
      key: "cover",
      label: "Hari Sisa",
      className: "text-right w-[100px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.days_of_cover,
      render: (r) => (r.days_of_cover != null ? `${formatNumber(r.days_of_cover)} h` : "—"),
    },
    {
      key: "lead",
      label: "Lead Time",
      className: "text-right w-[100px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.lead_time,
      render: (r) => `${r.lead_time} hari`,
    },
    {
      key: "suggested",
      label: "Usulan",
      className: "text-right min-w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.suggested_qty,
      render: (r) => (
        <b className={r.suggested_qty > 0 ? "text-primary" : ""}>
          {formatNumber(r.suggested_qty)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "value",
      label: "Nilai",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.suggested_qty * r.cost,
      render: (r) => formatIDR(r.suggested_qty * r.cost),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={statusTone[r.status]}>{statusLabel[r.status]}</Pill>,
    },
  ];

  const displayColumns = fullscreen
    ? columns.filter((c) => !FS_HIDDEN_COLUMNS.has(c.key))
    : columns;

  return (
    <>
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Laporan Stock Minimum"
          description={`Barang dengan stok di bawah minimum • pemakaian ${days} hari terakhir`}
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
            label="Perlu Restock"
            value={isLoading ? "…" : formatNumber(stats.perlu)}
            {...(isLoading ? {} : { hint: "di bawah minimum" })}
            icon={TriangleAlert}
            tone="warning"
          />
          <StatCard
            loading={isLoading}
            label="Nilai Kebutuhan"
            value={isLoading ? "…" : formatIDRCompact(stats.nilai)}
            {...(isLoading
              ? {}
              : { valueTitle: formatIDR(stats.nilai), hint: "total usulan restock" })}
            icon={PackageX}
            tone="brand"
          />
          <StatCard
            loading={isLoading}
            label="Barang Habis"
            value={isLoading ? "…" : formatNumber(stats.habis)}
            {...(isLoading ? {} : { hint: "stok nol" })}
            icon={TriangleAlert}
            tone="danger"
          />
          <StatCard
            loading={isLoading}
            label="Supplier Terkait"
            value={isLoading ? "…" : formatNumber(stats.suppliers)}
            {...(isLoading ? {} : { hint: "untuk restock" })}
            icon={Truck}
            tone="info"
          />
        </div>
        <Panel title="Filter">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari barang, SKU, supplier..."
                className="rounded-xl pl-9"
              />
            </div>
            <FilterSelect
              className="w-full"
              value={wh}
              onChange={setWh}
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
              value={days}
              onChange={setDays}
              placeholder="Periode"
              options={DAYS_OPTIONS}
            />
            <FilterSelect
              className="w-full"
              value={severity}
              onChange={setSeverity}
              placeholder="Semua Status"
              options={[...severityOptions]}
            />
          </div>
        </Panel>
      </div>
      <Panel
        title="Daftar Stock Minimum"
        description={`${formatNumber(rows.length)} barang`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Keluar mode layar penuh" : "Tampilkan layar penuh"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? "Keluar" : "Fullscreen"}
          </Button>
        }
        className={cn(fullscreen && "fixed inset-0 z-40 flex flex-col !rounded-none !shadow-none")}
        bodyClassName={cn(fullscreen && "flex-1 overflow-auto")}
      >
        <DataTable
          columns={displayColumns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => setSelectedId(r.id)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <Pill tone={statusTone[r.status]}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.sku ?? "—"} · {r.category ?? "—"} · {r.supplier ?? "—"}
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Stok</p>
                  <b>
                    {formatNumber(r.total_stock)} {r.unit ?? ""}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Min</p>
                  <b>{formatNumber(r.min)}</b>
                </div>
                <div>
                  <p className="text-muted-foreground">Usulan</p>
                  <b className="text-primary">{formatNumber(r.suggested_qty)}</b>
                </div>
              </div>
            </div>
          )}
        />
      </Panel>
      <StockMinimumSheet item={selected} onOpenChange={(o) => !o && setSelectedId(null)} />
    </>
  );
}
