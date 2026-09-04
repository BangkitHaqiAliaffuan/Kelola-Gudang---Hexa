import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  ClipboardList,
  FileSpreadsheet,
  Package,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, StatCard } from "./kit";
import { DataTable, type Column } from "./data-table";
import { Button } from "@/components/ui/button";
import { useTransaksiAnalytics } from "@/hooks/use-laporan";
import { useWarehouses } from "@/hooks/use-master";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import {
  AtRiskTable,
  BulanNilaiChart,
  ProsesPanel,
  TopPihakTable,
  matchPihak,
  pihakOptions,
} from "./laporan-analytics-shared";

/**
 * Analitik Transfer Gudang: arus antar gudang + net flow.
 * Sumber: GET /api/laporan/transaksi-analytics?type=Transfer Gudang.
 * "Nilai" = nilai pokok yang berpindah (qty × unit_cost), BUKAN omzet.
 */
export function LaporanTransferAnalytics({
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
  const [destId, setDestId] = useState<string>(ALL);
  const { data: warehouses } = useWarehouses();
  const destWarehouseId =
    destId === ALL ? null : (warehouses?.data.find((w) => w.name === destId)?.id ?? null);
  const { data, isLoading, isFetching } = useTransaksiAnalytics({
    type: "Transfer Gudang",
    from,
    to,
    warehouseId,
    destinationWarehouseId: destWarehouseId,
    enabled,
  });
  const a = data?.data;
  const busy = isLoading || isFetching;

  const options = useMemo(() => pihakOptions(a?.aktivitas ?? []), [a]);
  const f = (jenis: string, id: number | null, nama: string) => matchPihak(pihak, jenis, id, nama);

  const laneRows = useMemo(() => {
    const lanes = a?.arus?.lanes ?? [];
    if (pihak === ALL) return lanes;
    // Filter lane yang menyentuh gudang terpilih (asal atau tujuan).
    return lanes.filter(
      (l) =>
        matchPihak(pihak, "gudang", l.from_id, l.dari) ||
        matchPihak(pihak, "gudang", l.to_id, l.ke),
    );
  }, [a, pihak]);

  const chartRows = useMemo(
    () => (a?.per_bulan ?? []).map((b) => ({ ...b, jenis: "gudang" })),
    [a],
  );

  const momPct = a?.ringkasan.mom?.pct ?? null;

  const handleExportCsv = () => {
    if (!a) return;
    const meta = [
      { keterangan: "Laporan", nilai: "Analitik Transfer Gudang" },
      { keterangan: "Periode", nilai: `${formatDate(from)} s.d. ${formatDate(to)}` },
      { keterangan: "Total Nilai Mutasi (pokok)", nilai: formatIDR(a.ringkasan.nilai) },
      { keterangan: "Total Qty", nilai: formatNumber(a.ringkasan.qty) },
      { keterangan: "Dokumen", nilai: formatNumber(a.ringkasan.dokumen) },
    ];
    const content =
      toCsv(meta, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.arus?.lanes ?? [], [
        { key: "dari", label: "Asal" },
        { key: "ke", label: "Tujuan" },
        { key: "dokumen", label: "Dokumen" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.arus?.net ?? [], [
        { key: "nama", label: "Gudang" },
        { key: "keluar", label: "Keluar" },
        { key: "masuk", label: "Masuk" },
        { key: "net", label: "Net" },
      ]);
    downloadCsv(`analitik-transfer-${from}-${to}.csv`, content);
    toast.success("CSV analitik diunduh");
  };

  if (!enabled) return null;

  return (
    <>
      <PageHeader
        title="Analitik Arus Gudang"
        description="Nilai mutasi = nilai pokok yang berpindah (qty × unit_cost), dari dokumen Selesai"
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
            placeholder="Semua Gudang"
            options={options}
            loading={isLoading}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={destId}
            onChange={setDestId}
            placeholder="Semua Tujuan"
            options={warehouses?.data.map((w) => w.name) ?? []}
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton
              visible={pihak !== ALL || destId !== ALL}
              onClick={() => {
                setPihak(ALL);
                setDestId(ALL);
              }}
            />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Dokumen"
          value={busy ? "…" : formatNumber(a!.ringkasan.dokumen)}
          icon={ClipboardList}
          loading={busy}
        />
        <StatCard
          label="Total Qty Pindah"
          value={busy ? "…" : `${formatNumber(a!.ringkasan.qty)} unit`}
          icon={Package}
          tone="info"
          loading={busy}
        />
        <StatCard
          label="Nilai Mutasi"
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

      <Panel title="Nilai Mutasi per Bulan" description="Total per bulan">
        {busy ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <BulanNilaiChart rows={chartRows} />
        )}
      </Panel>

      <Panel title="Lane Asal → Tujuan" description="Arus per pasangan gudang">
        <DataTable
          columns={laneColumns}
          rows={laneRows.map((r, i) => ({ ...r, id: `lane:${r.from_id}:${r.to_id}:${i}` }))}
          pageSize={10}
          loading={busy}
          mobileCard={(r) => (
            <div className="space-y-1">
              <p className="truncate text-sm font-semibold">
                {r.dari} → {r.ke}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(r.dokumen)} dokumen · {formatNumber(r.qty)} unit
              </p>
              <p className="text-xs font-semibold">{formatIDR(r.nilai)}</p>
            </div>
          )}
        />
      </Panel>

      <Panel title="Net Flow per Gudang" description="Surplus (+) / defisit (−) periode ini">
        <DataTable
          columns={netColumns}
          rows={(a?.arus?.net ?? []).map((r, i) => ({
            ...r,
            id: `net:${r.warehouse_id ?? r.nama}:${i}`,
          }))}
          pageSize={10}
          loading={busy}
          mobileCard={(r) => (
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{r.nama}</span>
              <span className={r.net < 0 ? "text-destructive" : "text-success"}>
                {r.net >= 0 ? "+" : ""}
                {formatNumber(r.net)}
              </span>
            </div>
          )}
        />
      </Panel>

      <Panel title="Top Gudang Tujuan" description="Peringkat penerima + share kumulatif (Pareto)">
        <TopPihakTable
          rows={(a?.top_pihak ?? []).filter((r) => f(r.jenis, r.id, r.nama))}
          loading={busy}
        />
      </Panel>

      <AtRiskTable rows={a?.aktivitas ?? []} loading={busy} />
      <ProsesPanel proses={a?.proses} loading={busy} />
    </>
  );
}

const laneColumns: Column<
  { id: string } & {
    from_id: number | null;
    dari: string;
    to_id: number | null;
    ke: string;
    qty: number;
    nilai: number;
    dokumen: number;
  }
>[] = [
  {
    key: "dari",
    label: "Asal",
    className: "min-w-[150px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.dari}</span>,
  },
  {
    key: "ke",
    label: "Tujuan",
    className: "min-w-[150px]",
    sortable: true,
    render: (r) => (
      <span className="inline-flex items-center gap-1 font-semibold">
        <ArrowLeftRight className="h-3 w-3 text-muted-foreground" /> {r.ke}
      </span>
    ),
  },
  {
    key: "dokumen",
    label: "Dok",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.dokumen),
  },
  {
    key: "qty",
    label: "Qty",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.qty),
  },
  {
    key: "nilai",
    label: "Nilai",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.nilai),
  },
];

const netColumns: Column<
  { id: string } & {
    warehouse_id: number | null;
    nama: string;
    keluar: number;
    masuk: number;
    net: number;
  }
>[] = [
  {
    key: "nama",
    label: "Gudang",
    className: "min-w-[150px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "keluar",
    label: "Keluar",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.keluar),
  },
  {
    key: "masuk",
    label: "Masuk",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.masuk),
  },
  {
    key: "net",
    label: "Net",
    className: "text-right",
    sortable: true,
    render: (r) => (
      <span className={r.net < 0 ? "text-destructive" : "text-success"}>
        {r.net >= 0 ? "+" : ""}
        {formatNumber(r.net)}
      </span>
    ),
  },
];
