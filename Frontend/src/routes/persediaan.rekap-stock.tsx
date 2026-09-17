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
  const hasActiveFilters = useMemo(() => q !== "" || wh !== ALL || cat !== ALL, [q, wh, cat]);
  const handleClearFilters = useCallback(() => {
    setQ("");
    // reset() kembali ke gudang default user — bukan global. Di halaman ini
    // "hapus filter" harus berarti eksplisit Semua agar total/lokasi global.
    whFilter.onChange(ALL);
    setCat(ALL);
  }, [whFilter]);

  const rows = useMemo(() => {
    // Fold SELALU dari seluruh lokasi agar total dan sebaran
    // mencerminkan keseluruhan gudang. Filter gudang hanya menyaring
    // daftar barang (wajib ada stock > 0 di gudang itu) + menyorot barisnya.
    const folded = foldStockRekap(data?.data ?? [], items?.data ?? []);
    const qn = debouncedQ.trim().toLowerCase();
    const whId = whFilter.warehouseId;
    return folded.filter(
      (r) =>
        (!qn || `${r.name} ${r.sku}`.toLowerCase().includes(qn)) &&
        (cat === ALL || r.category === cat) &&
        (whId == null || r.warehouses.some((w) => w.warehouse_id === whId && w.stock > 0)),
    );
  }, [data, items, debouncedQ, whFilter.warehouseId, cat]);

  const stats = useMemo(() => {
    return {
      sku: rows.length,
      nilai: rows.reduce((a, r) => a + r.nilai, 0),
      lokasi: rows.reduce((a, r) => a + r.locationCount, 0),
      gudang: new Set(rows.flatMap((r) => r.warehouses.map((w) => w.warehouse_id))).size,
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
        lokasi:
          r.warehouses
            .map((w) => `${w.warehouse}:${w.stock} (tersedia ${w.available})`)
            .join("; ") || "—",
      })),
      [
        { key: "nama", label: "Barang" },
        { key: "sku", label: "SKU" },
        { key: "satuan", label: "Satuan" },
        { key: "kategori", label: "Kategori" },
        { key: "total", label: "Total Stock" },
        { key: "available", label: "Available" },
        { key: "nilai", label: "Nilai" },
        { key: "lokasi", label: "Lokasi Stock" },
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
      label: "Lokasi Stock",
      className: "min-w-[260px]",
      render: (r) => (
        <RekapLocationsCell
          row={r}
          highlightId={whFilter.warehouseId}
          onWarehouseClick={(wid) => goToCard(r.item_id, wid)}
        />
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
            hint="Baris lokasi semua gudang, untuk barang tampil"
            icon={Boxes}
          />
          <StatCard
            loading={isLoading}
            label="Gudang Aktif"
            value={formatNumber(stats.gudang)}
            hint="Milik barang tampil, semua gudang"
            icon={Boxes}
            tone="success"
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
            <div className="ml-auto flex shrink-0 items-end">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Rekap per Barang"
        description={`${formatNumber(rows.length)} barang · total & lokasi selalu global · klik baris untuk detail · klik gudang untuk kartu stock`}
        actions={
          <HelpHint label="Penjelasan">
            <p>Total dan daftar lokasi selalu mencakup SEMUA gudang.</p>
            <p>
              Filter gudang hanya menyaring daftar barang (yang ada stock-nya di gudang itu) dan
              menebalkan barisnya.
            </p>
            <p>Klik baris gudang untuk membuka kartu stock gudang tersebut.</p>
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
                <Pill tone={r.warehouses.length > 0 ? "info" : "neutral"}>
                  {r.warehouses.length > 0 ? `${r.warehouses.length} gudang` : "Tidak ada stock"}
                </Pill>
              </div>
              <RekapLocationsCompact
                row={r}
                highlightId={whFilter.warehouseId}
                onWarehouseClick={(wid) => goToCard(r.item_id, wid)}
              />
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
