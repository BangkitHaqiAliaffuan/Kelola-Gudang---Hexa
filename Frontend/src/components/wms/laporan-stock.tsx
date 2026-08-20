import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Boxes,
  FileSpreadsheet,
  Package,
  Printer,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useItems, useWarehouses } from "@/hooks/use-master";
import { useStockRows } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { StockRowApi } from "@/lib/persediaan-types";

const statusTone: Record<StockRowApi["status"], Tone> = {
  Habis: "danger",
  Menipis: "warning",
  Overstock: "info",
  Normal: "success",
};

/**
 * Laporan Stock berbasis API (`GET /api/persediaan/stock`).
 * Satu baris per lokasi (item x gudang x bin), di-fetch lengkap lalu
 * difilter client-side (search/gudang/kategori/status) — pola baku aplikasi.
 */
export function LaporanStock() {
  const { status: authStatus, hasModuleLevel } = useAuth();
  const canView = hasModuleLevel("Persediaan", "Baca");
  const noAccess = authStatus === "authenticated" && !canView;

  const { data, isLoading } = useStockRows();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: items } = useItems();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const itemCat = useMemo(
    () => new Map((items?.data ?? []).map((i) => [i.id, i.category])),
    [items],
  );

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (r) =>
          (!qn || `${r.name ?? ""} ${r.sku ?? ""}`.toLowerCase().includes(qn)) &&
          (wh === ALL || r.warehouse === wh) &&
          (cat === ALL || itemCat.get(r.item_id) === cat) &&
          (status === ALL || r.status === status),
      ),
    [data, qn, wh, cat, status, itemCat],
  );

  const stats = useMemo(() => {
    const sku = new Set(rows.map((r) => r.item_id)).size;
    const qty = rows.reduce((s, r) => s + r.stock, 0);
    const nilai = rows.reduce((s, r) => s + r.nilai, 0);
    const habis = rows.filter((r) => r.status === "Habis").length;
    return { sku, qty, nilai, habis };
  }, [rows]);

  const chart = useMemo(
    () =>
      [
        ...rows
          .reduce((byWh, r) => {
            const key = r.warehouse ?? "—";
            return byWh.set(key, (byWh.get(key) ?? 0) + r.nilai);
          }, new Map<string, number>())
          .entries(),
      ]
        .map(([warehouse, nilai]) => ({ warehouse, nilai }))
        .sort((a, b) => b.nilai - a.nilai),
    [rows],
  );

  const handleExportCsv = () => {
    const metaRows = [
      { keterangan: "Laporan", nilai: "Laporan Stock" },
      { keterangan: "Gudang", nilai: wh === ALL ? "Semua" : wh },
      { keterangan: "Kategori", nilai: cat === ALL ? "Semua" : cat },
      { keterangan: "Status", nilai: status === ALL ? "Semua" : status },
      {
        keterangan: "Baris",
        nilai: `${formatNumber(rows.length)} lokasi / ${formatNumber(stats.sku)} SKU`,
      },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = rows.map((r) => ({
      name: r.name ?? "",
      sku: r.sku ?? "",
      unit: r.unit ?? "",
      warehouse: r.warehouse ?? "",
      rack: r.rack ?? "",
      bin: r.bin ?? "",
      qty: r.stock,
      reserved: r.reserved,
      available: r.available,
      nilai: r.nilai,
      status: r.status,
    }));
    const content =
      toCsv(metaRows, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(dataRows, [
        { key: "name", label: "Barang" },
        { key: "sku", label: "SKU" },
        { key: "unit", label: "Satuan" },
        { key: "warehouse", label: "Gudang" },
        { key: "rack", label: "Rak" },
        { key: "bin", label: "Bin" },
        { key: "qty", label: "Qty" },
        { key: "reserved", label: "Reserved" },
        { key: "available", label: "Available" },
        { key: "nilai", label: "Nilai Stock" },
        { key: "status", label: "Status" },
      ]);
    downloadCsv(`laporan-stock-${new Date().toISOString().slice(0, 10)}.csv`, content);
    toast.success("CSV diunduh");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
      return;
    }
    const tbody = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name ?? "—"}</td>
        <td class="mono">${r.sku ?? "—"}</td>
        <td>${r.unit ?? "—"}</td>
        <td>${r.warehouse ?? "—"}</td>
        <td class="mono">${r.rack ?? "—"}</td>
        <td class="mono">${r.bin ?? "—"}</td>
        <td class="right">${formatNumber(r.stock)}</td>
        <td class="right">${formatNumber(r.reserved)}</td>
        <td class="right">${formatNumber(r.available)}</td>
        <td class="right">${formatIDR(r.nilai)}</td>
        <td>${r.status}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>Laporan Stock — KelolaGudang</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .right{text-align:right}
  .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
</style></head><body>
<h1>Laporan Stock</h1>
<p class="mono muted">${wh === ALL ? "Semua Gudang" : wh} · ${cat === ALL ? "Semua Kategori" : cat} · ${formatNumber(rows.length)} lokasi / ${formatNumber(stats.sku)} SKU</p>
<table>
  <thead><tr><th>Barang</th><th>SKU</th><th>Satuan</th><th>Gudang</th><th>Rak</th><th>Bin</th><th class="right">Qty</th><th class="right">Reserved</th><th class="right">Available</th><th class="right">Nilai</th><th>Status</th></tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  };

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
      key: "rack",
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
      key: "stock",
      label: "Qty",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.stock,
      render: (r) => `${formatNumber(r.stock)} ${r.unit ?? ""}`,
    },
    {
      key: "reserved",
      label: "Reserved",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.reserved,
      render: (r) => `${formatNumber(r.reserved)} ${r.unit ?? ""}`,
    },
    {
      key: "available",
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
      key: "nilai",
      label: "Nilai Stock",
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

  if (noAccess) {
    return (
      <EmptyState
        title="Tidak memiliki akses"
        description="Akun Anda tidak memiliki akses Baca pada modul Persediaan. Hubungi administrator untuk mengatur hak akses."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Laporan Stock"
        description="Posisi stok terkini per gudang, rak, dan bin location"
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handlePrint}
              disabled={rows.length === 0}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total SKU" value={formatNumber(stats.sku)} icon={Boxes} />
        <StatCard
          label="Total Qty"
          value={`${formatNumber(stats.qty)} unit`}
          icon={Package}
          tone="info"
        />
        <StatCard
          label="Nilai Persediaan"
          value={formatIDR(stats.nilai)}
          icon={Wallet}
          tone="success"
          valueTitle={formatIDR(stats.nilai)}
        />
        <StatCard
          label="Habis"
          value={formatNumber(stats.habis)}
          icon={TriangleAlert}
          tone="danger"
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full"
            value={cat}
            onChange={setCat}
            placeholder="Semua Kategori"
            options={cats?.data.map((c) => c.name) ?? []}
            loading={catsLoading}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={["Habis", "Menipis", "Overstock", "Normal"]}
          />
        </div>
      </Panel>

      <Panel title="Nilai per Gudang" description={`${formatNumber(chart.length)} gudang`}>
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatIDRCompact(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="warehouse"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={190}
                tickFormatter={(name) => (name.length > 24 ? `${name.slice(0, 24)}…` : name)}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
                formatter={(value) => [formatIDR(Number(value)), "Nilai"]}
              />
              <Bar dataKey="nilai" name="Nilai" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Belum ada data" description="Tidak ada stok pada filter ini." />
        )}
      </Panel>

      <Panel
        title="Detail Laporan"
        description={`${formatNumber(rows.length)} lokasi${isLoading ? " · memperbarui..." : ""}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          initialSort={{ key: "name", dir: "asc" }}
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
              <p className="text-xs">
                Nilai stock: <b className="text-foreground">{formatIDR(r.nilai)}</b>
              </p>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
