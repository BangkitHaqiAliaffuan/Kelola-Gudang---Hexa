import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  ListChecks,
  Printer,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
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
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { companyKopHtml, useCompanySettings } from "@/hooks/use-settings";
import { buildPrintDoc, escPrintText, openPrintWindow } from "@/lib/print-doc";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocuments } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { LaporanBarangMasukKeluar } from "@/components/wms/laporan-barang-masuk-keluar";
import { LaporanKartuStock } from "@/components/wms/laporan-kartu-stock";
import { LaporanMutasi } from "@/components/wms/laporan-mutasi";
import { LaporanStock } from "@/components/wms/laporan-stock";
import { LaporanStockMinimum } from "@/components/wms/laporan-stock-minimum";
import { LaporanDeadStock } from "@/components/wms/laporan-dead-stock";
import { LaporanFastMoving } from "@/components/wms/laporan-fast-moving";
import { LaporanNilaiPersediaan } from "@/components/wms/laporan-nilai-persediaan";
import type { StockDocumentApi } from "@/lib/persediaan-types";
import { formatDate, formatNumber, warehouses } from "@/lib/wms-data";
import { Boxes } from "lucide-react";

const titles: Record<string, string> = {
  stock: "Laporan Stock",
  "barang-masuk": "Laporan Barang Masuk",
  "barang-keluar": "Laporan Barang Keluar",
  transfer: "Laporan Transfer Gudang",
  "retur-pembelian": "Laporan Retur Pembelian",
  "retur-penjualan": "Laporan Retur Penjualan",
  mutasi: "Laporan Mutasi",
  "kartu-stock": "Laporan Kartu Stock",
  "nilai-persediaan": "Laporan Nilai Persediaan",
  "stock-minimum": "Laporan Stock Minimum",
  "stock-opname": "Laporan Stock Opname",
  "dead-stock": "Laporan Barang Tidak Bergerak",
  "fast-moving": "Laporan Fast Moving Item",
};

export const Route = createFileRoute("/laporan/$report")({
  beforeLoad: ({ params }) => {
    if (!(params.report in titles)) throw notFound();
  },
  head: ({ params }) => {
    const title = `${titles[params.report] ?? "Laporan"} — KelolaGudang`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "Laporan gudang lengkap dengan filter, chart, dan export.",
        },
        { property: "og:title", content: title },
        { property: "og:description", content: "Analisis data gudang siap cetak." },
      ],
    };
  },
  component: Laporan,
});

type Row = {
  id: string;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f?: string;
  g?: string;
};

/** Baris dokumen opname: list API mengagregasi checked_count per dokumen. */
type OpnameDoc = StockDocumentApi & { checked_count?: number };

const opnameStatusTone = (s: string): Tone =>
  s === "Selesai" ? "success" : s === "Draft" ? "warning" : s === "Dibatalkan" ? "danger" : "info";

function Laporan() {
  const { report } = Route.useParams();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const { data: filterWarehouses } = useWarehouses();
  const whFilter = useWarehouseFilter(filterWarehouses?.data);
  const wh = whFilter.value;
  const [filterDate, setFilterDate] = useState("2026-07-01");
  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || filterDate !== "2026-07-01",
    [q, wh, filterDate],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setFilterDate("2026-07-01");
  }, [whFilter]);

  const isStockOpname = report === "stock-opname";

  const {
    data: opnameDocs,
    isLoading: opnameLoading,
    error: opnameError,
    refetch: refetchOpname,
  } = useStockDocuments({
    type: "Stock Opname",
  });
  const { data: company } = useCompanySettings();
  const opnameRows: OpnameDoc[] = isStockOpname ? ((opnameDocs?.data ?? []) as OpnameDoc[]) : [];
  if (report === "stock") return <LaporanStock />;
  if (report === "barang-masuk") return <LaporanBarangMasukKeluar type="Penerimaan" />;
  if (report === "barang-keluar") return <LaporanBarangMasukKeluar type="Pengeluaran" />;
  if (report === "transfer") return <LaporanBarangMasukKeluar type="Transfer Gudang" />;
  if (report === "retur-pembelian") return <LaporanBarangMasukKeluar type="Retur Pembelian" />;
  if (report === "retur-penjualan") return <LaporanBarangMasukKeluar type="Retur Penjualan" />;
  if (report === "kartu-stock") return <LaporanKartuStock />;
  if (report === "stock-minimum") return <LaporanStockMinimum />;
  if (report === "mutasi") return <LaporanMutasi />;
  if (report === "dead-stock") return <LaporanDeadStock />;
  if (report === "fast-moving") return <LaporanFastMoving />;
  if (report === "nilai-persediaan") return <LaporanNilaiPersediaan />;

  // Cabang non-opname tak terjangkau (slug dikenal selain stock-opname
  // didelegasikan ke komponen riil; slug asing → notFound di beforeLoad).
  const source: Row[] = isStockOpname
    ? opnameRows.map((d) => ({
        id: String(d.id),
        a: d.no,
        b: formatDate(d.document_date),
        c: d.warehouse ?? "—",
        d: formatNumber(d.line_count),
        e: formatNumber(d.checked_count ?? 0),
        f: d.status,
        g: d.pic ?? "—",
      }))
    : [];

  const rows = source.filter(
    (r) =>
      `${r.a} ${r.b} ${r.c}`.toLowerCase().includes(debouncedQ.toLowerCase()) &&
      (wh === ALL || r.c === wh),
  );

  const headers = isStockOpname
    ? ["Nomor", "Tanggal", "Gudang", "SKU", "Tercatat", "Status", "PIC"]
    : ["Nomor", "Tanggal", "Gudang", "Qty", "Nilai"];

  const columns: Column<Row>[] = headers.map((h, i) => ({
    key: String(i),
    label: h,
    className: isStockOpname ? (i === 3 || i === 4 ? "text-right" : "") : i > 2 ? "text-right" : "",
    render: (r) => {
      const v = [r.a, r.b, r.c, r.d, r.e, r.f, r.g][i];
      if (isStockOpname && i === 5) {
        return <Pill tone={opnameStatusTone(r.f ?? "")}>{r.f}</Pill>;
      }
      return (
        <span className={i === 0 ? "font-mono text-xs font-semibold text-primary" : "font-medium"}>
          {v}
        </span>
      );
    },
  }));

  const reportTitle = titles[report] ?? "Laporan";
  const reportSlug = report.replace(/[^a-z0-9-]+/gi, "-");

  const handleExport = () => {
    const keys = headers.map((_, i) => `k${i}`);
    const content = toCsv(
      rows.map((r) => {
        const cells = [r.a, r.b, r.c, r.d, r.e, r.f ?? "", r.g ?? ""].slice(0, headers.length);
        return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""]));
      }),
      headers.map((label, i) => ({ key: `k${i}`, label })),
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`${reportSlug}-${today}.csv`, content);
    toast.success(`Export ${rows.length} baris`);
  };

  const handlePrint = () => {
    const t = (v: string | null | undefined) => escPrintText(v);
    const thead = headers.map((h) => `<th>${t(h)}</th>`).join("");
    const tbody = rows
      .map((r) => {
        const cells = [r.a, r.b, r.c, r.d, r.e, r.f ?? "", r.g ?? ""].slice(0, headers.length);
        return `<tr>${cells.map((c) => `<td>${t(c)}</td>`).join("")}</tr>`;
      })
      .join("");
    openPrintWindow(
      buildPrintDoc({
        title: reportTitle,
        kopHtml: companyKopHtml(company),
        bodyHtml: `<h1>${t(reportTitle)}</h1>
<p class="mono muted">Periode Agustus 2025 – Juli 2026 · ${formatNumber(rows.length)} baris</p>
<table>
  <thead><tr>${thead}</tr></thead>
  <tbody>${tbody}</tbody>
</table>`,
      }),
    );
  };

  const whOptions = isStockOpname
    ? Array.from(new Set(opnameRows.map((d) => d.warehouse).filter((w): w is string => Boolean(w))))
    : warehouses.map((w) => w.name);

  const runningCount = opnameRows.filter((d) => d.status === "Draft").length;
  const doneCount = opnameRows.filter((d) => d.status === "Selesai").length;
  const unchecked = opnameRows.reduce((a, d) => a + (d.line_count - (d.checked_count ?? 0)), 0);

  return (
    <>
      <PageHeader
        title={titles[report] ?? "Laporan"}
        description="Periode Agustus 2025 – Juli 2026"
        actions={
          <>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/opname/$section" params={{ section: "laporan" }}>
                <ArrowLeft className="h-4 w-4" /> Kembali
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              disabled
              title="Export PDF belum didukung — gunakan Excel atau Print"
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button className="rounded-xl" onClick={handlePrint} disabled={rows.length === 0}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isStockOpname ? (
          <>
            <StatCard
              label="Total Sesi"
              value={opnameLoading ? "…" : formatNumber(opnameRows.length)}
              icon={ClipboardCheck}
              loading={opnameLoading}
            />
            <StatCard
              label="Berjalan"
              value={opnameLoading ? "…" : formatNumber(runningCount)}
              icon={ClipboardCheck}
              tone="warning"
              loading={opnameLoading}
            />
            <StatCard
              label="Selesai"
              value={opnameLoading ? "…" : formatNumber(doneCount)}
              icon={CheckCheck}
              tone="success"
              loading={opnameLoading}
            />
            <StatCard
              label="Belum Dicek"
              value={opnameLoading ? "…" : formatNumber(unchecked)}
              icon={ListChecks}
              tone="danger"
              loading={opnameLoading}
            />
          </>
        ) : (
          <>
            <StatCard label="Total Baris" value={formatNumber(rows.length)} icon={Boxes} />
            <StatCard
              label="Gudang Terlibat"
              value={formatNumber(new Set(rows.map((r) => r.c)).size)}
              icon={Boxes}
              tone="info"
            />
          </>
        )}
      </div>

      <Panel title="Filter">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={whFilter.value}
            onChange={whFilter.onChange}
            placeholder="Semua Gudang"
            options={whOptions}
          />
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="rounded-xl"
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>

      {/* Grafik mock dihapus: slug non-opname tak terjangkau (didelegasikan/404). */}

      <Panel title="Detail Laporan" description={`${formatNumber(rows.length)} baris`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isStockOpname && opnameLoading}
          error={isStockOpname ? opnameError : null}
          onRetry={isStockOpname ? () => refetchOpname() : undefined}
          mobileCard={(r) =>
            isStockOpname ? (
              <div className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate font-mono text-sm font-semibold">{r.a}</p>
                  <Pill tone={opnameStatusTone(r.f ?? "")}>{r.f}</Pill>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.b} · {r.c}
                </p>
                <p className="text-xs">
                  {r.d} SKU · {r.e} tercatat · PIC {r.g}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">{r.a}</p>
                  <Pill tone="brand">{r.d}</Pill>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.b} · {r.c}
                </p>
                <p className="text-xs font-semibold">{r.e}</p>
              </div>
            )
          }
        />
      </Panel>
    </>
  );
}
