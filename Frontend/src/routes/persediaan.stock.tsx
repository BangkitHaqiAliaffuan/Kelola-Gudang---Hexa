import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Download, Maximize2, Minimize2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
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
import { useCategories, useItems, useWarehouses } from "@/hooks/use-master";
import { useStockRows } from "@/hooks/use-persediaan";
import { cn } from "@/lib/utils";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import type { StockRowApi } from "@/lib/persediaan-types";

export const Route = createFileRoute("/persediaan/stock")({
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

function StockSaatIni() {
  const { data, isLoading } = useStockRows();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: items } = useItems();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [cat, setCat] = useState(ALL);
  const [fullscreen, setFullscreen] = useState(false);
  const hasActiveFilters = useMemo(() => q !== "" || wh !== ALL || cat !== ALL, [q, wh, cat]);
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setCat(ALL);
  }, [whFilter]);

  const itemCat = useMemo(
    () => new Map((items?.data ?? []).map((i) => [i.id, i.category])),
    [items],
  );

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (it) =>
          (!debouncedQ ||
            `${it.name ?? ""} ${it.sku ?? ""}`.toLowerCase().includes(debouncedQ.toLowerCase())) &&
          (wh === ALL || it.warehouse === wh) &&
          (cat === ALL || itemCat.get(it.item_id) === cat),
      ),
    [data, debouncedQ, wh, cat, itemCat],
  );

  const warehouseNames = useMemo(() => warehouses?.data.map((w) => w.name) ?? [], [warehouses]);
  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const columns: Column<StockRowApi>[] = [
    {
      key: "name",
      label: "Barang",
      className: "min-w-[220px]",
      sortable: true,
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
      sortable: true,
      render: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span>,
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone="neutral">{r.unit ?? "—"}</Pill>,
    },
    {
      key: "wh",
      label: "Gudang",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.warehouse ?? "",
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "rak",
      label: "Rak",
      className: "w-[80px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.rack ?? "",
      render: (r) => r.rack ?? "Lantai",
    },
    {
      key: "bin",
      label: "Bin",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.bin ?? "",
      render: (r) => r.bin ?? "Lantai",
    },
    {
      key: "qty",
      label: "Qty",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.stock,
      render: (r) => `${formatNumber(r.stock)} ${r.unit ?? ""}`,
    },
    {
      key: "res",
      label: "Reserved",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.reserved,
      render: (r) => `${formatNumber(r.reserved)} ${r.unit ?? ""}`,
    },
    {
      key: "avl",
      label: "Available",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.available,
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
      sortable: true,
      render: (r) => (r.min != null ? `${formatNumber(r.min)} ${r.unit ?? ""}` : "—"),
    },
    {
      key: "max",
      label: "Maximum",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => (r.max != null ? `${formatNumber(r.max)} ${r.unit ?? ""}` : "—"),
    },
    {
      key: "val",
      label: "Nilai Stock",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.stock * r.cost,
      render: (r) => formatIDR(r.stock * r.cost),
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
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Stock Saat Ini"
          description="Posisi stok real-time di seluruh gudang"
          actions={
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Export Excel diproses")}
            >
              <Download className="h-4 w-4" /> Export
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
        description={`${formatNumber(rows.length)} baris`}
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
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
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
            </div>
          )}
        />
      </Panel>
    </>
  );
}
