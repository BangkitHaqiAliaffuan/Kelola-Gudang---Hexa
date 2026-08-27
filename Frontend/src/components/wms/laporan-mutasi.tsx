import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Boxes,
  FileSpreadsheet,
  Package,
  Printer,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
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
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { useLaporanMutasi } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { LaporanMutasiRowApi } from "@/lib/persediaan-types";

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function LaporanMutasi() {
  const { status: authStatus, hasModuleLevel } = useAuth();
  const canView = hasModuleLevel("Laporan", "Baca");
  const noAccess = authStatus === "authenticated" && !canView;

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [from, setFrom] = useState(() =>
    toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
  );
  const [to, setTo] = useState(() => toISODate(new Date()));
  const hasActiveFilters = useMemo(() => {
    const defaultFrom = toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
    const defaultTo = toISODate(new Date());
    return q !== "" || wh !== ALL || cat !== ALL || from !== defaultFrom || to !== defaultTo;
  }, [q, wh, cat, from, to]);
  const handleClearFilters = useCallback(() => {
    setQ("");
    setWh(ALL);
    setCat(ALL);
    setFrom(toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)));
    setTo(toISODate(new Date()));
  }, []);

  const whId = useMemo(
    () => (wh === ALL ? null : (warehouses?.data.find((w) => w.name === wh)?.id ?? null)),
    [wh, warehouses],
  );
  const catId = useMemo(
    () => (cat === ALL ? null : (cats?.data.find((c) => c.name === cat)?.id ?? null)),
    [cats, cat],
  );

  const rangeValid = Boolean(from) && Boolean(to) && from <= to;

  const { data, isLoading, isFetching } = useLaporanMutasi({
    from: from || toISODate(new Date()),
    to: to || toISODate(new Date()),
    warehouseId: whId,
    categoryId: catId,
    search: debouncedQ.trim() || null,
    perPage: 500,
    enabled: canView && rangeValid,
  });

  const rows = useMemo(() => (data?.data ?? []) as LaporanMutasiRowApi[], [data]);

  const stats = useMemo(() => {
    const sku = new Set(rows.map((r) => r.item_id)).size;
    const masuk = rows.reduce((s, r) => s + r.masuk, 0);
    const keluar = rows.reduce((s, r) => s + r.keluar, 0);
    const nilai = rows.reduce((s, r) => s + r.nilai_akhir, 0);
    return { sku, masuk, keluar, nilai };
  }, [rows]);

  const chart = useMemo(() => {
    // Top 8 by nilai_akhir
    return [...rows]
      .sort((a, b) => b.nilai_akhir - a.nilai_akhir)
      .slice(0, 8)
      .map((r) => ({ name: r.name ?? r.sku ?? "—", nilai: r.nilai_akhir }));
  }, [rows]);

  const periodLabel = from && to && from <= to ? `${from} s.d. ${to}` : "Semua periode";

  const handleExportCsv = () => {
    const metaRows = [
      { keterangan: "Laporan", nilai: "Laporan Mutasi" },
      { keterangan: "Periode", nilai: periodLabel },
      { keterangan: "Gudang", nilai: wh === ALL ? "Semua" : wh },
      { keterangan: "Kategori", nilai: cat === ALL ? "Semua" : cat },
      { keterangan: "Baris", nilai: `${formatNumber(rows.length)} SKU` },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = rows.map((r) => ({
      sku: r.sku ?? "",
      name: r.name ?? "",
      category: r.category ?? "",
      unit: r.unit ?? "",
      saldo_awal: r.saldo_awal,
      masuk: r.masuk,
      keluar: r.keluar,
      saldo_akhir: r.saldo_akhir,
      nilai_akhir: r.nilai_akhir,
    }));
    const content =
      toCsv(metaRows, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(dataRows, [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "category", label: "Kategori" },
        { key: "unit", label: "Satuan" },
        { key: "saldo_awal", label: "Saldo Awal" },
        { key: "masuk", label: "Masuk" },
        { key: "keluar", label: "Keluar" },
        { key: "saldo_akhir", label: "Saldo Akhir" },
        { key: "nilai_akhir", label: "Nilai Akhir" },
      ]);
    downloadCsv(`laporan-mutasi-${from}-${to}.csv`, content);
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
        <td>${r.category ?? "—"}</td>
        <td>${r.unit ?? "—"}</td>
        <td class="right">${formatNumber(r.saldo_awal)}</td>
        <td class="right">${formatNumber(r.masuk)}</td>
        <td class="right">${formatNumber(r.keluar)}</td>
        <td class="right"><b>${formatNumber(r.saldo_akhir)}</b></td>
        <td class="right">${formatIDR(r.nilai_akhir)}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>Laporan Mutasi</title>
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
<h1>Laporan Mutasi</h1>
<p class="mono muted">Periode: ${periodLabel} · ${wh === ALL ? "Semua Gudang" : wh} · ${wh === ALL ? "" : ""}${formatNumber(rows.length)} SKU</p>
<table>
  <thead><tr><th>Barang</th><th>SKU</th><th>Kategori</th><th>Satuan</th><th class="right">Saldo Awal</th><th class="right">Masuk</th><th class="right">Keluar</th><th class="right">Saldo Akhir</th><th class="right">Nilai Akhir</th></tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  };

  const columns: Column<LaporanMutasiRowApi>[] = [
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
      key: "saldo_awal",
      label: "Saldo Awal",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.saldo_awal),
    },
    {
      key: "masuk",
      label: "Masuk",
      className: "text-right w-[90px] whitespace-nowrap text-success",
      sortable: true,
      render: (r) => `+${formatNumber(r.masuk)}`,
    },
    {
      key: "keluar",
      label: "Keluar",
      className: "text-right w-[90px] whitespace-nowrap text-destructive",
      sortable: true,
      render: (r) => (r.keluar ? `-${formatNumber(r.keluar)}` : "—"),
    },
    {
      key: "saldo_akhir",
      label: "Saldo Akhir",
      className: "text-right w-[110px] whitespace-nowrap font-semibold",
      sortable: true,
      render: (r) => `${formatNumber(r.saldo_akhir)} ${r.unit ?? ""}`,
    },
    {
      key: "nilai_akhir",
      label: "Nilai Akhir",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.nilai_akhir,
      render: (r) => formatIDR(r.nilai_akhir),
    },
  ];

  if (noAccess) {
    return (
      <EmptyState
        title="Tidak memiliki akses"
        description="Akun Anda tidak memiliki akses Baca pada modul Laporan. Hubungi administrator untuk mengatur hak akses."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Laporan Mutasi"
        description="Ringkas pergerakan stok per SKU (saldo awal, masuk, keluar, saldo akhir) — periode & gudang"
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExportCsv}
              disabled={rows.length === 0 || !rangeValid}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handlePrint}
              disabled={rows.length === 0 || !rangeValid}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total SKU"
          value={isLoading || isFetching ? "…" : formatNumber(stats.sku)}
          icon={Boxes}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Total Masuk"
          value={isLoading || isFetching ? "…" : formatNumber(stats.masuk)}
          icon={TrendingUp}
          tone="success"
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Total Keluar"
          value={isLoading || isFetching ? "…" : formatNumber(stats.keluar)}
          icon={TrendingDown}
          tone="warning"
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Nilai Akhir"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.nilai)}
          icon={Wallet}
          tone="brand"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.nilai) })}
          loading={isLoading || isFetching}
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Dari tanggal"
            className="rounded-xl"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Sampai tanggal"
            className="rounded-xl"
          />
          <div className="flex items-end justify-start xl:justify-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>

      <Panel title="Nilai Akhir per Barang (Top 8)" description={periodLabel}>
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
                dataKey="name"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={180}
                tickFormatter={(n) => (n.length > 20 ? `${n.slice(0, 20)}…` : n)}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
                formatter={(value) => [formatIDR(Number(value)), "Nilai Akhir"]}
              />
              <Bar dataKey="nilai" name="Nilai" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="Belum ada data"
            description="Tidak ada mutasi pada periode dan filter ini."
          />
        )}
      </Panel>

      <Panel
        title="Detail Laporan"
        description={`${formatNumber(rows.length)} SKU${isFetching ? " · memperbarui..." : ""} · ${periodLabel}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          initialSort={{ key: "name", dir: "asc" }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <Pill tone="neutral">
                  {r.saldo_akhir} {r.unit ?? ""}
                </Pill>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {r.sku ?? "—"} · {r.category ?? "—"}
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Awal</p>
                  <b>{formatNumber(r.saldo_awal)}</b>
                </div>
                <div>
                  <p className="text-success">Masuk</p>
                  <b>+{formatNumber(r.masuk)}</b>
                </div>
                <div>
                  <p className="text-destructive">Keluar</p>
                  <b>{formatNumber(r.keluar)}</b>
                </div>
              </div>
              <p className="text-xs">
                Nilai akhir: <b>{formatIDR(r.nilai_akhir)}</b>
              </p>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
