import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Maximize2, Minimize2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  HelpHint,
  PageHeader,
  Panel,
  Pill,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useServerTable } from "@/hooks/use-server-table";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/api";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import type { StockRowApi } from "@/lib/persediaan-types";

export const Route = createFileRoute("/persediaan/stock/")({
  head: () => ({
    meta: [
      { title: "Stock Saat Ini — KelolaGudang" },
      { name: "description", content: "Posisi stok terkini per gudang, rak, dan bin location." },
      { property: "og:title", content: "Stock Saat Ini — KelolaGudang" },
      {
        property: "og:description",
        content: "Qty, reserved, available, dan nilai stok real-time.",
      },
    ],
  }),
  component: StockSaatIni,
});

const statusTone: Record<StockRowApi["status"], Tone> = {
  Habis: "danger",
  Menipis: "warning",
  Overstock: "info",
  Normal: "success",
};

const PAGE_SIZE = 12;

function StockSaatIni() {
  const navigate = useNavigate();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [cat, setCat] = useState(ALL);
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState(1);

  // Kembali ke halaman 1 setiap kali filter berubah (Fase 4: paginasi server).
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, wh, cat]);

  // FilterSelect memakai nama; server butuh id.
  const categoryId = cat === ALL ? null : (cats?.data.find((c) => c.name === cat)?.id ?? null);

  const { rows, total, lastPage, isLoading, error, refetch } = useServerTable<StockRowApi>(
    ["persediaan", "stock"],
    "/persediaan/stock",
    {
      page,
      perPage: PAGE_SIZE,
      search: debouncedQ || null,
      filters: { warehouse_id: whFilter.warehouseId, category_id: categoryId },
    },
  );

  const hasActiveFilters = useMemo(() => q !== "" || wh !== ALL || cat !== ALL, [q, wh, cat]);
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
  }, [whFilter]);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Export mencakup SEMUA baris terfilter (bukan 1 halaman): fetchAll terpisah (Fase 4).
      const params: Record<string, string> = {};
      if (debouncedQ) params["search"] = debouncedQ;
      if (whFilter.warehouseId != null) params["warehouse_id"] = String(whFilter.warehouseId);
      if (categoryId != null) params["category_id"] = String(categoryId);
      const res = await fetchAll<StockRowApi>("/persediaan/stock", params);
      const content = toCsv(
        res.data.map((it) => ({
          nama: it.name ?? "—",
          sku: it.sku ?? "—",
          satuan: it.unit ?? "—",
          gudang: it.warehouse ?? "—",
          rak: it.rack ?? "—",
          bin: it.bin ?? "—",
          stock: it.stock,
          reserved: it.reserved,
          available: it.available,
          min: it.min,
          max: it.max ?? "—",
          cost: it.cost,
          status: it.status,
        })),
        [
          { key: "nama", label: "Barang" },
          { key: "sku", label: "SKU" },
          { key: "satuan", label: "Satuan" },
          { key: "gudang", label: "Gudang" },
          { key: "rak", label: "Rak" },
          { key: "bin", label: "Bin" },
          { key: "stock", label: "Stock" },
          { key: "reserved", label: "Reserved" },
          { key: "available", label: "Available" },
          { key: "min", label: "Min" },
          { key: "max", label: "Max" },
          { key: "cost", label: "HPP" },
          { key: "status", label: "Status" },
        ],
      );
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`stock-saat-ini-${today}.csv`, content);
      toast.success(`Export ${res.data.length} baris`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export gagal.");
    } finally {
      setExporting(false);
    }
  }, [debouncedQ, whFilter, categoryId]);

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const goToDetail = useCallback(
    (r: StockRowApi) =>
      void navigate({
        to: "/persediaan/stock/$itemId",
        params: { itemId: String(r.item_id) },
      }),
    [navigate],
  );

  // Sort header nonaktif: backend mengurutkan nama barang tetap dan tidak
  // menyediakan param sort — sort client atas 1 halaman menyesatkan (Fase 4).
  const columns: Column<StockRowApi>[] = [
    {
      key: "name",
      label: "Barang",
      className: "min-w-[220px]",
      render: (r) => (
        <span className="block max-w-[280px] truncate font-medium" title={r.name ?? ""}>
          {r.name ?? "—"}
        </span>
      ),
    },
    {
      key: "sku",
      label: "SKU",
      className: "w-[110px] whitespace-nowrap",
      render: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span>,
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[90px] whitespace-nowrap",
      render: (r) => <Pill tone="neutral">{r.unit ?? "—"}</Pill>,
    },
    {
      key: "wh",
      label: "Gudang",
      className: "min-w-[140px] whitespace-nowrap",
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "rak",
      label: "Rak",
      className: "w-[80px] whitespace-nowrap",
      render: (r) => r.rack ?? "Lantai",
    },
    {
      key: "bin",
      label: "Bin",
      className: "w-[90px] whitespace-nowrap",
      render: (r) => r.bin ?? "Lantai",
    },
    {
      key: "qty",
      label: "Qty",
      className: "text-right w-[110px] whitespace-nowrap",
      render: (r) => `${formatNumber(r.stock)} ${r.unit ?? ""}`,
    },
    {
      key: "res",
      label: "Reserved",
      className: "text-right w-[110px] whitespace-nowrap",
      render: (r) => `${formatNumber(r.reserved)} ${r.unit ?? ""}`,
    },
    {
      key: "avl",
      label: "Available",
      className: "text-right w-[110px] whitespace-nowrap",
      render: (r) => (
        <b>
          {formatNumber(r.available)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "min",
      label: "Minimum",
      className: "text-right w-[110px] whitespace-nowrap",
      render: (r) => (r.min != null ? `${formatNumber(r.min)} ${r.unit ?? ""}` : "—"),
    },
    {
      key: "max",
      label: "Maximum",
      className: "text-right w-[110px] whitespace-nowrap",
      render: (r) => (r.max != null ? `${formatNumber(r.max)} ${r.unit ?? ""}` : "—"),
    },
    {
      key: "val",
      label: "Nilai Stock",
      className: "text-right min-w-[130px] whitespace-nowrap",
      render: (r) => formatIDR(r.stock * r.cost),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[100px] whitespace-nowrap",
      render: (r) => <Pill tone={statusTone[r.status]}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Stock Saat Ini"
          description="Posisi stok real-time di seluruh gudang"
          actions={
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExport}
              disabled={rows.length === 0 || isLoading || exporting}
            >
              <Download className="h-4 w-4" /> {exporting ? "Mengekspor..." : "Export"}
            </Button>
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
              hideAll={whFilter.hideAll}
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
            <div className="ml-auto flex shrink-0 items-end">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Posisi Stock"
        description={`${formatNumber(total)} baris`}
        actions={
          <>
            <HelpHint label="Penjelasan kolom">
              <p>Available = total stok dikurangi yang sudah dipesan orang (reservasi).</p>
              <p>Nilai Stock = stok × harga pokok master.</p>
              <p>
                Status: Habis = stok nol. Menipis = di bawah Batas Min. Overstock =
                mencapai/melebihi Batas Maks. Normal = aman.
              </p>
            </HelpHint>
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
          pageSize={PAGE_SIZE}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={goToDetail}
          serverPage={page}
          serverTotalRows={total}
          serverTotalPages={lastPage}
          onServerPageChange={setPage}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <Pill tone={statusTone[r.status]}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.warehouse ?? "—"} · {r.rack ?? "Lantai"} · {r.bin ?? "Lantai"} · satuan{" "}
                {r.unit ?? "—"}
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Qty</p>
                  <b>
                    {formatNumber(r.stock)} {r.unit ?? ""}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Reserved</p>
                  <b>
                    {formatNumber(r.reserved)} {r.unit ?? ""}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <b>
                    {formatNumber(r.available)} {r.unit ?? ""}
                  </b>
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
