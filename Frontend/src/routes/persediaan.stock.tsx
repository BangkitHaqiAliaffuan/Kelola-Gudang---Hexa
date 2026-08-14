import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel, Pill, type Tone } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useCategories, useItems, useWarehouses } from "@/hooks/use-master";
import { useStockRows } from "@/hooks/use-persediaan";
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
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);

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
      sortAccessor: (r) => r.warehouse,
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "rak",
      label: "Rak",
      className: "w-[80px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.rack,
      render: (r) => r.rack ?? "—",
    },
    {
      key: "bin",
      label: "Bin",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.bin,
      render: (r) => r.bin ?? "—",
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
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari barang atau SKU..."
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
        </div>
      </Panel>
      <Panel title="Posisi Stock" description={`${formatNumber(rows.length)} baris`}>
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
                {r.warehouse ?? "—"} · {r.rack ?? "—"} · {r.bin ?? "—"} · satuan {r.unit ?? "—"}
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
