import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel, Pill } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  categories,
  formatIDR,
  formatNumber,
  items,
  stockStatus,
  warehouses,
  type Item,
} from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/stock")({
  head: () => ({
    meta: [
      { title: "Stock Saat Ini — KelolaGudang" },
      { name: "description", content: "Posisi stok terkini per gudang, rak, dan bin location." },
      { property: "og:title", content: "Stock Saat Ini — KelolaGudang" },
      { property: "og:description", content: "Qty, reserved, available, dan nilai stok real-time." },
    ],
  }),
  component: StockSaatIni,
});

function StockSaatIni() {
  const [q, setQ] = useState("");
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);

  const rows = useMemo(
    () =>
      items.filter(
        (it) =>
          (!q || `${it.name} ${it.sku}`.toLowerCase().includes(q.toLowerCase())) &&
          (wh === ALL || it.warehouse === wh) &&
          (cat === ALL || it.category === cat),
      ),
    [q, wh, cat],
  );

  const columns: Column<Item>[] = [
    { key: "name", label: "Barang", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: "unit", label: "Satuan", render: (r) => <Pill tone="neutral">{r.unit}</Pill> },
    { key: "wh", label: "Gudang", render: (r) => r.warehouse },
    { key: "rak", label: "Rak", render: (r) => r.rack },
    { key: "bin", label: "Bin", render: (r) => r.bin },
    {
      key: "qty",
      label: "Qty",
      className: "text-right",
      render: (r) => `${formatNumber(r.stock)} ${r.unit}`,
    },
    {
      key: "res",
      label: "Reserved",
      className: "text-right",
      render: (r) => `${formatNumber(r.reserved)} ${r.unit}`,
    },
    {
      key: "avl",
      label: "Available",
      className: "text-right",
      render: (r) => (
        <b>
          {formatNumber(r.stock - r.reserved)} {r.unit}
        </b>
      ),
    },
    {
      key: "min",
      label: "Minimum",
      className: "text-right",
      render: (r) => `${formatNumber(r.min)} ${r.unit}`,
    },
    {
      key: "max",
      label: "Maximum",
      className: "text-right",
      render: (r) => `${formatNumber(r.max)} ${r.unit}`,
    },
    {
      key: "val",
      label: "Nilai Stock",
      className: "text-right",
      render: (r) => formatIDR(r.stock * r.cost),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const s = stockStatus(r);
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Saat Ini"
        description="Posisi stok real-time di seluruh gudang"
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Export Excel diproses")}>
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
          <FilterSelect value={wh} onChange={setWh} placeholder="Semua Gudang" options={warehouses.map((w) => w.name)} />
          <FilterSelect value={cat} onChange={setCat} placeholder="Semua Kategori" options={categories} />
        </div>
      </Panel>
      <Panel title="Posisi Stock" description={`${formatNumber(rows.length)} baris`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          mobileCard={(r) => {
            const s = stockStatus(r);
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.warehouse} · {r.rack} · {r.bin} · satuan {r.unit}
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Qty</p>
                    <b>
                      {formatNumber(r.stock)} {r.unit}
                    </b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reserved</p>
                    <b>
                      {formatNumber(r.reserved)} {r.unit}
                    </b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Available</p>
                    <b>
                      {formatNumber(r.stock - r.reserved)} {r.unit}
                    </b>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </Panel>
    </>
  );
}