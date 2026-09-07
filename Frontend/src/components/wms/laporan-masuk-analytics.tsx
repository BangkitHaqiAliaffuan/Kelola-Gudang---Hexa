import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  FileSpreadsheet,
  Package,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, Pill, StatCard } from "./kit";
import { DataTable, type Column } from "./data-table";
import { Button } from "@/components/ui/button";
import { useTransaksiAnalytics } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import {
  AtRiskTable,
  BulanNilaiChart,
  PIHAK_LABEL,
  PIHAK_TONE,
  PihakBulanTable,
  ProsesPanel,
  TopPihakTable,
  matchPihak,
  pihakKeyOf,
  pihakOptions,
  withRowId,
} from "./laporan-analytics-shared";

/**
 * Analitik Barang Masuk per supplier per bulan.
 * Sumber: GET /api/laporan/transaksi-analytics?type=Penerimaan.
 * "Nilai" = nilai pokok (qty × unit_cost), BUKAN omzet.
 */
export function LaporanMasukAnalytics({
  from,
  to,
  warehouseId,
  enabled,
}: {
  from: string;
  to: string;
  warehouseId: number | null;
  enabled: boolean;
}) {
  const [pihak, setPihak] = useState<string>(ALL);
  const { data, isLoading, isFetching } = useTransaksiAnalytics({
    type: "Penerimaan",
    from,
    to,
    warehouseId,
    enabled,
  });
  const a = data?.data;
  const busy = isLoading || isFetching;

  const options = useMemo(() => pihakOptions(a?.aktivitas ?? []), [a]);
  const f = (jenis: string, id: number | null, nama: string) => matchPihak(pihak, jenis, id, nama);

  const chartRows = useMemo(
    () => (a?.per_pihak_per_bulan ?? []).filter((r) => f(r.jenis, r.id, r.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, pihak],
  );
  const topRows = useMemo(
    () => (a?.top_pihak ?? []).filter((r) => f(r.jenis, r.id, r.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, pihak],
  );
  const bulanRows = useMemo(
    () => (a?.per_pihak_per_bulan ?? []).filter((r) => f(r.jenis, r.id, r.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, pihak],
  );
  const variansRows = useMemo(() => {
    const sel = pihak === ALL ? null : pihak;
    return (a?.varians_harga ?? []).filter((r) =>
      sel == null ? true : pihakKeyOf("supplier", r.supplier_id, r.supplier) === sel,
    );
  }, [a, pihak]);

  const momPct = a?.ringkasan.mom?.pct ?? null;
  const insight = useMemo(() => {
    if (!a || a.top_pihak.length === 0) return null;
    const top = a.top_pihak[0]!;
    const parts = [
      `${top.nama} memasok nilai terbesar: ${formatIDR(top.nilai)} (${top.share}% dari total penerimaan).`,
    ];
    if (momPct != null)
      parts.push(
        `Nilai bulan terakhir ${momPct >= 0 ? "naik" : "turun"} ${Math.abs(momPct)}% MoM.`,
      );
    const over = (a.varians_harga ?? []).filter((r) => (r.varians_pct ?? 0) > 0);
    if (over.length > 0)
      parts.push(`${over.length} item dibeli di atas Harga Pokok master — cek tabel varians.`);
    return parts.join(" ");
  }, [a, momPct]);

  const handleExportCsv = () => {
    if (!a) return;
    const meta = [
      { keterangan: "Laporan", nilai: "Analitik Barang Masuk" },
      { keterangan: "Periode", nilai: `${formatDate(from)} s.d. ${formatDate(to)}` },
      { keterangan: "Total Nilai (pokok)", nilai: formatIDR(a.ringkasan.nilai) },
      { keterangan: "Total Qty", nilai: formatNumber(a.ringkasan.qty) },
      { keterangan: "Dokumen", nilai: formatNumber(a.ringkasan.dokumen) },
    ];
    const content =
      toCsv(meta, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.per_pihak_per_bulan, [
        { key: "nama", label: "Supplier" },
        { key: "jenis", label: "Jenis" },
        { key: "bulan", label: "Bulan" },
        { key: "dokumen", label: "Dokumen" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.varians_harga ?? [], [
        { key: "supplier", label: "Supplier" },
        { key: "sku", label: "SKU" },
        { key: "nama", label: "Barang" },
        { key: "qty", label: "Qty" },
        { key: "avg_harga", label: "Rata-rata Beli" },
        { key: "master_cost", label: "HPP Master" },
        { key: "varians_pct", label: "Varians %" },
      ]);
    downloadCsv(`analitik-barang-masuk-${from}-${to}.csv`, content);
    toast.success("CSV analitik diunduh");
  };

  if (!enabled) return null;

  return (
    <>
      <PageHeader
        title="Analitik Pemasok"
        description="Nilai = nilai pokok (qty × unit_cost), dari dokumen Selesai"
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleExportCsv}
            disabled={!a || busy}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel Analitik
          </Button>
        }
      />
      <Panel title="Filter Analitik">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            className="w-full flex-1 min-w-[180px] max-w-[260px]"
            value={pihak}
            onChange={setPihak}
            placeholder="Semua Supplier"
            options={options}
            loading={isLoading}
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={pihak !== ALL} onClick={() => setPihak(ALL)} />
          </div>
        </div>
        {insight && <p className="mt-3 text-sm text-muted-foreground">{insight}</p>}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Dokumen"
          value={busy ? "…" : formatNumber(a!.ringkasan.dokumen)}
          icon={ClipboardList}
          loading={busy}
        />
        <StatCard
          label="Total Qty"
          value={busy ? "…" : `${formatNumber(a!.ringkasan.qty)} unit`}
          icon={Package}
          tone="info"
          loading={busy}
        />
        <StatCard
          label="Total Nilai"
          value={busy ? "…" : formatIDRCompact(a!.ringkasan.nilai)}
          icon={Wallet}
          tone="success"
          loading={busy}
          {...(busy ? {} : { valueTitle: formatIDR(a!.ringkasan.nilai) })}
        />
        <StatCard
          label="Tren Nilai MoM"
          value={busy || momPct == null ? "…" : `${momPct >= 0 ? "+" : ""}${momPct}%`}
          icon={momPct != null && momPct < 0 ? ArrowDownRight : ArrowUpRight}
          tone={momPct != null && momPct < 0 ? "danger" : "success"}
          loading={busy}
        />
      </div>

      <Panel title="Nilai per Bulan per Supplier" description="Stacked per bulan">
        {busy ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <BulanNilaiChart rows={chartRows} />
        )}
      </Panel>

      <Panel title="Top Supplier" description="Peringkat penyerap nilai + share kumulatif (Pareto)">
        <TopPihakTable rows={topRows} loading={busy} />
      </Panel>

      <Panel
        title="Nilai per Supplier per Bulan"
        description="Jawaban 'nilai dari 1 supplier dalam 1 bulan'"
      >
        <PihakBulanTable rows={bulanRows} loading={busy} />
      </Panel>

      {(a?.varians_harga?.length ?? 0) > 0 && (
        <Panel
          title="Varians Harga Beli"
          description="Rata-rata beli aktual vs Harga Pokok master — dasar negosiasi supplier"
        >
          <DataTable
            columns={variansColumns}
            rows={withRowId(variansRows, (r) => `var:${r.supplier_id ?? r.supplier}:${r.item_id}`)}
            pageSize={10}
            loading={busy}
            mobileCard={(r) => (
              <div className="space-y-1">
                <p className="truncate text-sm font-semibold">{r.nama}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.supplier} · {r.sku ?? "—"}
                </p>
                <p className="text-xs font-semibold">
                  Beli {formatIDR(r.avg_harga)} vs master {formatIDR(r.master_cost)}
                  {r.varians_pct != null ? ` (${r.varians_pct}%)` : ""}
                </p>
              </div>
            )}
          />
        </Panel>
      )}

      <AtRiskTable rows={a?.aktivitas ?? []} loading={busy} />
      <ProsesPanel proses={a?.proses} loading={busy} />
    </>
  );
}

const variansColumns: Column<
  { id: string } & {
    supplier: string;
    supplier_id: number | null;
    item_id: number;
    sku: string | null;
    nama: string;
    qty: number;
    avg_harga: number;
    master_cost: number;
    varians_pct: number | null;
  }
>[] = [
  {
    key: "supplier",
    label: "Supplier",
    className: "min-w-[160px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.supplier}</span>,
  },
  {
    key: "nama",
    label: "Barang",
    className: "min-w-[160px]",
    sortable: true,
    render: (r) => (
      <span>
        <span className="block font-semibold">{r.nama}</span>
        <span className="block font-mono text-xs text-muted-foreground">{r.sku ?? "—"}</span>
      </span>
    ),
  },
  {
    key: "avg_harga",
    label: "Rata-rata Beli",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.avg_harga),
  },
  {
    key: "master_cost",
    label: "HPP Master",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.master_cost),
  },
  {
    key: "varians_pct",
    label: "Varians",
    className: "text-right",
    sortable: true,
    sortAccessor: (r) => r.varians_pct ?? -9999,
    render: (r) =>
      r.varians_pct == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Pill
          tone={r.varians_pct > 0 ? "danger" : "success"}
        >{`${r.varians_pct >= 0 ? "+" : ""}${r.varians_pct}%`}</Pill>
      ),
  },
];
