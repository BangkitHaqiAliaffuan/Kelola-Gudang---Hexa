import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownToLine,
  Boxes,
  CircleDollarSign,
  FileSpreadsheet,
  Printer,
  Scale,
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
  FilterCombobox,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TableSkeleton,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useWarehouses } from "@/hooks/use-master";
import { companyKopHtml, useCompanySettings } from "@/hooks/use-settings";
import { useStockValuation } from "@/hooks/use-persediaan";
import { useLaporanMutasi } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import type { LaporanMutasiRowApi } from "@/lib/persediaan-types";

// Laporan formal (akuntansi): rekonsiliasi nilai per periode dengan SATU metode
// baku (Average — konsisten dengan nilai_akhir Laporan Mutasi). Berbeda peran
// dengan kokpit operasional persediaan/nilai (snapshot kini, 3 metode, ABC, aksi).
const METHOD_LABEL = "Average";
const METHOD_NOTE =
  "Arus dinilai dengan HPP Average kini (sama seperti Laporan Mutasi). Nilai awal adalah estimasi.";

const AGE_BUCKETS = [
  { value: ALL, label: "Semua Umur" },
  { value: "0-30", label: "≤ 30 hari" },
  { value: "31-60", label: "31–60 hari" },
  { value: "61-150", label: "61–150 hari" },
  { value: "150+", label: "> 150 hari" },
] as const;

type AgeBucket = (typeof AGE_BUCKETS)[number]["value"];

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ageBucket(days: number): Exclude<AgeBucket, typeof ALL> {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 150) return "61-150";
  return "150+";
}

function nilaiAwal(r: LaporanMutasiRowApi): number {
  return r.saldo_awal * r.unit_cost_avg;
}

function nilaiMasuk(r: LaporanMutasiRowApi): number {
  return r.masuk * r.unit_cost_avg;
}

function nilaiKeluar(r: LaporanMutasiRowApi): number {
  return r.keluar * r.unit_cost_avg;
}

function selisih(r: LaporanMutasiRowApi): number {
  return r.nilai_akhir - (nilaiAwal(r) + nilaiMasuk(r) - nilaiKeluar(r));
}

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function LaporanNilaiPersediaan() {
  const { status: authStatus, hasModuleLevel } = useAuth();
  const canView = hasModuleLevel("Laporan", "Baca");
  const noAccess = authStatus === "authenticated" && !canView;

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: company } = useCompanySettings();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>(ALL);
  const [from, setFrom] = useState(() =>
    toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
  );
  const [to, setTo] = useState(() => toISODate(new Date()));
  const hasActiveFilters = useMemo(() => {
    const defaultFrom = toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
    const defaultTo = toISODate(new Date());
    return (
      q !== "" ||
      wh !== ALL ||
      cat !== ALL ||
      ageFilter !== ALL ||
      from !== defaultFrom ||
      to !== defaultTo
    );
  }, [q, wh, cat, ageFilter, from, to]);
  const handleClearFilters = useCallback(() => {
    setQ("");
    setWh(ALL);
    setCat(ALL);
    setAgeFilter(ALL);
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

  const { data, isLoading, isFetching, error, refetch } = useLaporanMutasi({
    from: from || toISODate(new Date()),
    to: to || toISODate(new Date()),
    warehouseId: whId,
    categoryId: catId,
    search: debouncedQ.trim() || null,
    perPage: 500,
    enabled: canView && rangeValid,
  });

  // Jangkar konsistensi: snapshot kini (Average) dari sumber yang sama dengan kokpit.
  const { data: valData } = useStockValuation({
    warehouseId: whId,
    categoryId: catId,
    search: debouncedQ.trim() || null,
  });

  const allRows = useMemo(() => (data?.data ?? []) as LaporanMutasiRowApi[], [data]);

  const lastMoveById = useMemo(
    () => new Map((valData?.data ?? []).map((v) => [v.item_id, v.last_move_at])),
    [valData],
  );

  const rows = useMemo(() => {
    if (ageFilter === ALL) return allRows;
    return allRows.filter(
      (r) => ageBucket(daysSince(lastMoveById.get(r.item_id) ?? null)) === ageFilter,
    );
  }, [allRows, ageFilter, lastMoveById]);

  const stats = useMemo(() => {
    const sku = new Set(rows.map((r) => r.item_id)).size;
    const awal = rows.reduce((s, r) => s + nilaiAwal(r), 0);
    const masuk = rows.reduce((s, r) => s + nilaiMasuk(r), 0);
    const keluar = rows.reduce((s, r) => s + nilaiKeluar(r), 0);
    const akhir = rows.reduce((s, r) => s + r.nilai_akhir, 0);
    const gap = akhir - (awal + masuk - keluar);
    return { sku, awal, masuk, keluar, akhir, gap };
  }, [rows]);

  // Jangkar: total snapshot Average kini seharusnya dekat dengan Nilai Akhir
  // bila periode berakhir hari ini; selisih besar = sinyal data perlu ditelaah.
  const anchorAvg = useMemo(
    () => (valData?.data ?? []).reduce((s, v) => s + v.nilai_avg, 0),
    [valData],
  );

  const aging = useMemo(
    () =>
      (
        AGE_BUCKETS.filter((b) => b.value !== ALL) as Array<{
          value: Exclude<AgeBucket, typeof ALL>;
          label: string;
        }>
      ).map((b) => {
        const list = allRows.filter(
          (r) => ageBucket(daysSince(lastMoveById.get(r.item_id) ?? null)) === b.value,
        );
        return {
          bucket: b.label,
          sku: list.length,
          nilai: list.reduce((s, r) => s + r.nilai_akhir, 0),
        };
      }),
    [allRows, lastMoveById],
  );
  const agingTotal = aging.reduce((s, a) => s + a.nilai, 0);

  const movers = useMemo(
    () =>
      [...rows]
        .map((r) => ({ r, delta: r.nilai_akhir - nilaiAwal(r) }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5),
    [rows],
  );

  const periodLabel = from && to && from <= to ? `${from} s.d. ${to}` : "—";

  const handleExportCsv = () => {
    const metaRows = [
      { keterangan: "Laporan", nilai: "Laporan Nilai Persediaan" },
      { keterangan: "Periode", nilai: periodLabel },
      { keterangan: "Gudang", nilai: wh === ALL ? "Semua" : wh },
      { keterangan: "Kategori", nilai: cat === ALL ? "Semua" : cat },
      { keterangan: "Metode", nilai: METHOD_LABEL },
      { keterangan: "Catatan", nilai: METHOD_NOTE },
      { keterangan: "Baris", nilai: `${formatNumber(rows.length)} SKU` },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = rows.map((r) => ({
      sku: r.sku ?? "",
      name: r.name ?? "",
      category: r.category ?? "",
      unit: r.unit ?? "",
      saldo_awal: r.saldo_awal,
      nilai_awal_est: Math.round(nilaiAwal(r) * 100) / 100,
      masuk: r.masuk,
      nilai_masuk: Math.round(nilaiMasuk(r) * 100) / 100,
      keluar: r.keluar,
      nilai_keluar: Math.round(nilaiKeluar(r) * 100) / 100,
      saldo_akhir: r.saldo_akhir,
      nilai_akhir: r.nilai_akhir,
      selisih: Math.round(selisih(r) * 100) / 100,
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
        { key: "nilai_awal_est", label: "Nilai Awal (est)" },
        { key: "masuk", label: "Masuk" },
        { key: "nilai_masuk", label: "Nilai Masuk" },
        { key: "keluar", label: "Keluar" },
        { key: "nilai_keluar", label: "Nilai Keluar" },
        { key: "saldo_akhir", label: "Saldo Akhir" },
        { key: "nilai_akhir", label: "Nilai Akhir" },
        { key: "selisih", label: "Selisih" },
      ]);
    downloadCsv(`laporan-nilai-persediaan-${from}-${to}.csv`, content);
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
        <td class="right">${formatNumber(r.saldo_awal)}</td>
        <td class="right">${formatIDR(nilaiAwal(r))}</td>
        <td class="right">${formatNumber(r.masuk)}</td>
        <td class="right">${formatNumber(r.keluar)}</td>
        <td class="right"><b>${formatNumber(r.saldo_akhir)}</b></td>
        <td class="right"><b>${formatIDR(r.nilai_akhir)}</b></td>
        <td class="right">${formatIDR(selisih(r))}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>Laporan Nilai Persediaan</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .right{text-align:right}
  .sign{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}
  .sign div{text-align:center}
  .foot{margin-top:24px;font-size:11px;color:#64748b}
</style></head><body>
<h1>Laporan Nilai Persediaan</h1>
${companyKopHtml(company)}
<p class="mono muted">Periode: ${periodLabel} · Gudang: ${wh === ALL ? "Semua" : wh} · Kategori: ${cat === ALL ? "Semua" : cat} · Metode: ${METHOD_LABEL} · ${formatNumber(rows.length)} SKU</p>
<table>
  <thead><tr><th>Barang</th><th>SKU</th><th class="right">Saldo Awal</th><th class="right">Nilai Awal*</th><th class="right">Masuk</th><th class="right">Keluar</th><th class="right">Saldo Akhir</th><th class="right">Nilai Akhir</th><th class="right">Selisih</th></tr></thead>
  <tbody>${tbody}</tbody>
</table>
<p class="foot">Total Nilai Awal: ${formatIDR(stats.awal)} · Total Nilai Akhir: ${formatIDR(stats.akhir)} · Selisih: ${formatIDR(stats.gap)}<br/>*${METHOD_NOTE}</p>
<div class="sign"><div>Disiapkan oleh<br/><br/><br/>(............................)</div><div>Disetujui oleh<br/><br/><br/>(............................)</div></div>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span> · KelolaGudang Pro</span></div>
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
      key: "nilai_awal",
      label: "Nilai Awal*",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => nilaiAwal(r),
      render: (r) => formatIDR(nilaiAwal(r)),
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
    {
      key: "selisih",
      label: "Selisih",
      className: "text-right min-w-[120px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => selisih(r),
      render: (r) => {
        const g = selisih(r);
        return <span className={g === 0 ? "text-muted-foreground" : ""}>{formatIDR(g)}</span>;
      },
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
        title="Laporan Nilai Persediaan"
        description={`Rekonsiliasi nilai per periode · metode ${METHOD_LABEL} · ${periodLabel}`}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard
          label="Total SKU"
          value={isLoading || isFetching ? "…" : formatNumber(stats.sku)}
          icon={Boxes}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Nilai Awal*"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.awal)}
          icon={Wallet}
          tone="info"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.awal) })}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Nilai Masuk"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.masuk)}
          icon={TrendingUp}
          tone="success"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.masuk) })}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Nilai Keluar"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.keluar)}
          icon={TrendingDown}
          tone="warning"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.keluar) })}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Nilai Akhir"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.akhir)}
          icon={CircleDollarSign}
          tone="brand"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.akhir) })}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Selisih Rekonsiliasi"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.gap)}
          icon={Scale}
          tone={stats.gap === 0 ? "success" : "danger"}
          {...(isLoading || isFetching
            ? {}
            : {
                valueTitle: formatIDR(stats.gap),
                hint: `Jangkar kini: ${formatIDRCompact(anchorAvg)}`,
              })}
          loading={isLoading || isFetching}
        />
      </div>

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
          <FilterCombobox
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterCombobox
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={cat}
            onChange={setCat}
            placeholder="Semua Kategori"
            options={cats?.data.map((c) => c.name) ?? []}
            loading={catsLoading}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={ageFilter}
            onChange={(v) => setAgeFilter(v as AgeBucket)}
            placeholder="Semua Umur"
            options={[...AGE_BUCKETS]}
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
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Metode baku: {METHOD_LABEL}. {METHOD_NOTE}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Penuaan Nilai (Aging by Value)"
          description="Total Rp per umur stok terakhir bergerak"
        >
          {isLoading || isFetching ? (
            <TableSkeleton rows={4} cols={2} />
          ) : (
            <div className="space-y-3">
              {aging.map((a) => {
                const share = agingTotal > 0 ? (a.nilai / agingTotal) * 100 : 0;
                return (
                  <div key={a.bucket} className="rounded-xl border border-border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {a.bucket}{" "}
                        <span className="text-muted-foreground">
                          {formatNumber(a.sku)} SKU · {share.toFixed(1)}%
                        </span>
                      </p>
                      <Pill tone="neutral">{formatIDR(a.nilai)}</Pill>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${share}%`,
                          backgroundImage: "var(--gradient-primary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel
          title="Perubahan Nilai Terbesar"
          description="Selisih Nilai Akhir − Nilai Awal per SKU — narasi mengapa nilai berubah"
        >
          {isLoading || isFetching ? (
            <TableSkeleton rows={5} cols={2} />
          ) : movers.length === 0 ? (
            <EmptyState title="Belum ada data" />
          ) : (
            <div className="space-y-2">
              {movers.map(({ r, delta }) => (
                <div
                  key={r.item_id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.sku}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${delta < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {delta < 0 ? "−" : "+"}
                      {formatIDR(Math.abs(delta))}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatIDR(r.nilai_akhir)}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowDownToLine className="h-3 w-3" />
                Klik baris pada tabel Detail untuk melihat kartu stock per SKU.
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Detail Rekonsiliasi"
        description={`${formatNumber(rows.length)} SKU${isFetching ? " · memperbarui..." : ""} · ${periodLabel}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          initialSort={{ key: "nilai_akhir", dir: "desc" }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.name ?? "—"}</p>
                <Pill tone="neutral">
                  {formatNumber(r.saldo_akhir)} {r.unit ?? ""}
                </Pill>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {r.sku ?? "—"} · {r.category ?? "—"}
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Awal*</p>
                  <b>{formatIDR(nilaiAwal(r))}</b>
                </div>
                <div>
                  <p className="text-muted-foreground">Akhir</p>
                  <b>{formatIDR(r.nilai_akhir)}</b>
                </div>
                <div>
                  <p className="text-muted-foreground">Selisih</p>
                  <b>{formatIDR(selisih(r))}</b>
                </div>
              </div>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
