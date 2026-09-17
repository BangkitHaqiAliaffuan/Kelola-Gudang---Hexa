import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Boxes, ChevronsRight, Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterCombobox,
  HelpHint,
  PageHeader,
  Panel,
  Pill,
  StatCard,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { RouteForbidden } from "@/components/wms/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useCategories, useItems, useWarehouses } from "@/hooks/use-master";
import { useStockRows } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import { foldStockRekap, type RekapRow } from "@/lib/stock-rekap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/persediaan/rekap-stock")({
  head: () => ({
    meta: [
      { title: "Rekap Stock — KelolaGudang" },
      {
        name: "description",
        content: "Total stock per barang beserta rincian tiap gudang, satu baris per barang.",
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
  const { warehouseScope, status } = useAuth();
  const wh = whFilter.value;
  const [cat, setCat] = useState(ALL);
  const [fullscreen, setFullscreen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const highlightId = whFilter.warehouseId;
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

  /** Daftar gudang master — tiap gudang menjadi satu kolom qty (0 bila kosong). */
  const warehouseList = useMemo(() => {
    const all = warehouses?.data ?? [];
    // F7.5: user Terbatas hanya melihat kolom gudang izin (defense-in-depth;
    // backend sudah men-scope /master/warehouses).
    if (warehouseScope?.mode !== "Terbatas") return all;
    const ids = new Set(warehouseScope.ids ?? []);
    return all.filter((w) => ids.has(w.id));
  }, [warehouses, warehouseScope]);

  /** Qty barang di satu gudang; 0 bila tidak ada baris lokasi di gudang itu. */
  const qtyOf = useCallback(
    (r: RekapRow, warehouseId: number) =>
      r.warehouses.find((w) => w.warehouse_id === warehouseId)?.stock ?? 0,
    [],
  );

  /** Lompat ke ujung kanan tabel (kolom Total / Available / Total Nilai). */
  const scrollToTotals = useCallback(() => {
    const el = tableScrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, []);

  const handleExport = useCallback(() => {
    const content = toCsv(
      rows.map((r) => {
        const rec: Record<string, unknown> = {
          nama: r.name,
          sku: r.sku,
          satuan: r.unit || "—",
          kategori: r.category ?? "—",
        };
        for (const w of warehouseList) rec[`wh-${w.id}`] = qtyOf(r, w.id);
        rec["total"] = r.stock;
        rec["available"] = r.available;
        rec["nilai"] = Math.round(r.nilai);
        return rec;
      }),
      [
        { key: "nama", label: "Barang" },
        { key: "sku", label: "SKU" },
        { key: "satuan", label: "Satuan" },
        { key: "kategori", label: "Kategori" },
        ...warehouseList.map((w) => ({ key: `wh-${w.id}`, label: w.name })),
        { key: "total", label: "Total Stock" },
        { key: "available", label: "Available" },
        { key: "nilai", label: "Nilai" },
      ],
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`rekap-stock-${today}.csv`, content);
    toast.success(`Export ${rows.length} barang`);
  }, [rows, warehouseList, qtyOf]);

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const columns: Column<RekapRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Barang",
        className: "min-w-[220px]",
        sticky: "left",
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
      // Satu kolom per gudang: qty barang di gudang itu (0 bila kosong).
      // Kolom gudang yang sedang difilter ikut ditintai agar mudah ditemukan.
      ...warehouseList.map((w): Column<RekapRow> => ({
        key: `wh-${w.id}`,
        label: w.name,
        className: cn(
          "text-right min-w-[110px] whitespace-nowrap",
          highlightId != null && w.id === highlightId && "bg-primary/[0.07]",
        ),
        sortable: true,
        sortAccessor: (r) => qtyOf(r, w.id),
        render: (r) => {
          const qty = qtyOf(r, w.id);
          return (
            <button
              type="button"
              title={`Buka kartu stock ${w.name}`}
              onClick={(e) => {
                e.stopPropagation();
                goToCard(r.item_id, w.id);
              }}
              className={cn(
                "font-medium tabular-nums",
                qty === 0 ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {formatNumber(qty)}
            </button>
          );
        },
      })),
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
    ],
    [warehouseList, highlightId, qtyOf, goToCard],
  );

  // F7: halaman ini khusus lingkup gudang Semua (menampilkan seluruh stock).
  // Cermin gate modul: tolak hanya saat sesi authenticated.
  if (status === "authenticated" && warehouseScope?.mode === "Terbatas") {
    return (
      <RouteForbidden description="Halaman Rekap Stock membutuhkan lingkup gudang Semua karena menampilkan seluruh stock. Hubungi administrator bila Anda merasa seharusnya dapat mengakses halaman tersebut." />
    );
  }

  return (
    <>
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Rekap Stock"
          description="Total per barang + rincian tiap gudang, tanpa buka satu-satu"
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
            <FilterCombobox
              className="w-full min-w-[140px] max-w-[180px] flex-1"
              value={wh}
              onChange={whFilter.onChange}
              hideAll={whFilter.hideAll}
              placeholder="Semua Gudang"
              options={warehouseNames}
              loading={warehousesLoading}
            />
            <FilterCombobox
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
        description={`${formatNumber(rows.length)} barang · 1 kolom per gudang · klik angka untuk kartu stock`}
        actions={
          <>
            <HelpHint label="Penjelasan">
              <p>Satu kolom per gudang berisi qty barang di gudang itu (0 = tidak ada stock).</p>
              <p>Total, Available & Total Nilai selalu mencakup SEMUA gudang.</p>
              <p>Filter gudang hanya menyaring daftar barang dan menyorot kolom gudang tersebut.</p>
              <p>
                Klik angka qty untuk membuka kartu stock gudang tersebut. Tombol Ke Total melompat
                ke ujung kanan tabel.
              </p>
            </HelpHint>
            <Button
              variant="outline"
              size="sm"
              className="hidden rounded-xl md:inline-flex"
              onClick={scrollToTotals}
              aria-label="Lompat ke kolom Total di ujung kanan tabel"
            >
              <ChevronsRight className="h-4 w-4" /> Ke Total
            </Button>
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
          </>
        }
        className={cn(fullscreen && "fixed inset-0 z-40 flex flex-col !rounded-none !shadow-none")}
        bodyClassName={cn(fullscreen && "flex-1 overflow-auto")}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={goToDetail}
          scrollRef={tableScrollRef}
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
              {warehouseList.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {warehouseList.map((w) => {
                    const qty = qtyOf(r, w.id);
                    const hl = highlightId == null || w.id === highlightId;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToCard(r.item_id, w.id);
                        }}
                        className={cn(
                          "flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs",
                          hl ? "bg-muted/60 font-medium" : "opacity-50",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {w.name}
                        </span>
                        <b className="shrink-0 tabular-nums text-foreground">{formatNumber(qty)}</b>
                      </button>
                    );
                  })}
                </div>
              )}
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
