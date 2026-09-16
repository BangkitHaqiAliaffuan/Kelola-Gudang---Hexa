import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Boxes, Download } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  HelpHint,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { RekapLocationsCell, RekapLocationsCompact } from "@/components/wms/rekap-locations-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useCategories, useItems, useWarehouses } from "@/hooks/use-master";
import { useStockRows } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import { foldStockRekap, type RekapRow } from "@/lib/stock-rekap";
import type { StockRowApi } from "@/lib/persediaan-types";

export const Route = createFileRoute("/persediaan/rekap-stock")({
  head: () => ({
    meta: [
      { title: "Rekap Stock — KelolaGudang" },
      {
        name: "description",
        content: "Total stock per barang beserta sebaran lokasi gudang, satu baris per barang.",
      },
      { property: "og:title", content: "Rekap Stock — KelolaGudang" },
    ],
  }),
  component: RekapStock,
});

const statusTone: Record<StockRowApi["status"], Tone> = {
  Habis: "danger",
  Menipis: "warning",
  Overstock: "info",
  Normal: "success",
};

function RekapStock() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useStockRows();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: items } = useItems();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [cat, setCat] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || cat !== ALL || status !== ALL,
    [q, wh, cat, status],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
    setStatus(ALL);
  }, [whFilter]);

  const rows = useMemo(() => {
    // Filter gudang dipakai SEBELUM fold agar total mencerminkan gudang terpilih.
    const locs = (data?.data ?? []).filter((r) => wh === ALL || r.warehouse === wh);
    const folded = foldStockRekap(locs, items?.data ?? []);
    const qn = debouncedQ.trim().toLowerCase();
    return folded.filter(
      (r) =>
        (!qn || `${r.name} ${r.sku}`.toLowerCase().includes(qn)) &&
        (cat === ALL || r.category === cat) &&
        (status === ALL || r.status === status),
    );
  }, [data, items, debouncedQ, wh, cat, status]);

  const stats = useMemo(() => {
    const needAttention = rows.filter((r) => r.status === "Habis" || r.status === "Menipis").length;
    return {
      sku: rows.length,
      nilai: rows.reduce((a, r) => a + r.nilai, 0),
      lokasi: rows.reduce((a, r) => a + r.locationCount, 0),
      needAttention,
    };
  }, [rows]);

  const goToDetail = useCallback(
    (r: RekapRow) =>
      void navigate({
        to: "/persediaan/stock/$itemId",
        params: { itemId: String(r.item_id) },
      }),
    [navigate],
  );

  const goToCard = useCallback(
    (itemId: number, warehouseId: number) =>
      void navigate({
        to: "/persediaan/kartu-stock",
        search: { item_id: itemId, warehouse_id: warehouseId },
      }),
    [navigate],
  );

  const handleExport = useCallback(() => {
    const content = toCsv(
      rows.map((r) => ({
        nama: r.name,
        sku: r.sku,
        satuan: r.unit || "—",
        kategori: r.category ?? "—",
        total: r.stock,
        available: r.available,
        nilai: Math.round(r.nilai),
        status: r.status,
        lokasi: r.warehouses.map((w) => `${w.warehouse}:${w.stock}`).join("; ") || "—",
      })),
      [
        { key: "nama", label: "Barang" },
        { key: "sku", label: "SKU" },
        { key: "satuan", label: "Satuan" },
        { key: "kategori", label: "Kategori" },
        { key: "total", label: "Total Stock" },
        { key: "available", label: "Available" },
        { key: "nilai", label: "Nilai" },
        { key: "status", label: "Status" },
        { key: "lokasi", label: "Sebaran Gudang" },
      ],
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`rekap-stock-${today}.csv`, content);
    toast.success(`Export ${rows.length} barang`);
  }, [rows]);

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const columns: Column<RekapRow>[] = [
    {
      key: "name",
      label: "Barang",
      className: "min-w-[220px]",
      sortable: true,
      render: (r) => (
        <span>
          <span className="block max-w-[280px] truncate font-medium" title={r.name}>
            {r.name}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{r.sku}</span>
        </span>
      ),
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[90px] whitespace-nowrap",
      render: (r) => <Pill tone="neutral">{r.unit || "—"}</Pill>,
    },
    {
      key: "loc",
      label: "Sebaran Gudang",
      className: "min-w-[220px]",
      render: (r) => (
        <RekapLocationsCell row={r} onWarehouseClick={(wid) => goToCard(r.item_id, wid)} />
      ),
    },
    {
      key: "total",
      label: "Total Stock",
      className: "text-right w-[120px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.stock,
      render: (r) => (
        <b>
          {formatNumber(r.stock)} {r.unit}
        </b>
      ),
    },
    {
      key: "avl",
      label: "Available",
      className: "text-right w-[120px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.available,
      render: (r) => (
        <b>
          {formatNumber(r.available)} {r.unit}
        </b>
      ),
    },
    {
      key: "val",
      label: "Total Nilai",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.nilai,
      render: (r) => formatIDR(r.nilai),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={statusTone[r.status]}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <div className="space-y-5">
        <PageHeader
          title="Rekap Stock"
          description="Total per barang + sebaran gudang, tanpa buka satu-satu"
          actions={
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExport}
              disabled={rows.length === 0 || isLoading}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            loading={isLoading}
            label="Total SKU"
            value={formatNumber(stats.sku)}
            icon={Boxes}
            tone="info"
          />
          <StatCard
            loading={isLoading}
            label="Total Nilai"
            value={formatIDRCompact(stats.nilai)}
            valueTitle={formatIDR(stats.nilai)}
            icon={Boxes}
          />
          <StatCard
            loading={isLoading}
            label="Titik Lokasi"
            value={formatNumber(stats.lokasi)}
            icon={Boxes}
          />
          <StatCard
            loading={isLoading}
            label="Perlu Perhatian"
            value={formatNumber(stats.needAttention)}
            hint="Habis + Menipis"
            icon={Boxes}
            tone={stats.needAttention > 0 ? "warning" : "success"}
          />
        </div>

        <Panel title="Filter">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari barang atau SKU..."
                className="rounded-xl"
              />
            </div>
            <FilterSelect
              className="w-full min-w-[140px] max-w-[180px] flex-1"
              value={wh}
              onChange={whFilter.onChange}
              placeholder="Semua Gudang"
              options={warehouseNames}
              loading={warehousesLoading}
            />
            <FilterSelect
              className="w-full min-w-[140px] max-w-[180px] flex-1"
              value={cat}
              onChange={setCat}
              placeholder="Semua Kategori"
              options={categoryNames}
              loading={catsLoading}
            />
            <FilterSelect
              className="w-full min-w-[140px] max-w-[180px] flex-1"
              value={status}
              onChange={setStatus}
              placeholder="Semua Status"
              options={["Habis", "Menipis", "Overstock", "Normal"]}
            />
            <div className="ml-auto flex shrink-0 items-end">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Rekap per Barang"
        description={`${formatNumber(rows.length)} barang · klik baris untuk detail · klik segmen bar untuk kartu stock gudang`}
        actions={
          <HelpHint label="Penjelasan">
            <p>
              Bar = proporsi stock per gudang (terbesar paling pekat). Angka di sampingnya = gudang
              dominan.
            </p>
            <p>Klik segmen bar untuk membuka kartu stock gudang tersebut.</p>
            <p>
              Status: total 0 = Habis; selain itu peringkat terburuk lokasi (Menipis &gt; Overstock
              &gt; Normal).
            </p>
          </HelpHint>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={goToDetail}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{r.sku}</p>
                </div>
                <Pill tone={statusTone[r.status]}>{r.status}</Pill>
              </div>
              <RekapLocationsCompact row={r} />
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <b>
                    {formatNumber(r.stock)} {r.unit}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <b>
                    {formatNumber(r.available)} {r.unit}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Nilai</p>
                  <b>{formatIDRCompact(r.nilai)}</b>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                onClick={() => goToDetail(r)}
              >
                Lihat Detail
              </Button>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
