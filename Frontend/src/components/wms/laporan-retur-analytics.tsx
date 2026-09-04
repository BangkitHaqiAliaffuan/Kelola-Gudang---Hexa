import { useMemo, useState } from "react";
import { ClipboardList, FileSpreadsheet, Package, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, StatCard } from "./kit";
import { DataTable, type Column } from "./data-table";
import { Button } from "@/components/ui/button";
import { useTransaksiAnalytics } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { TransaksiAnalyticsType } from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import {
  AtRiskTable,
  BulanNilaiChart,
  PihakBulanTable,
  ProsesPanel,
  TopPihakTable,
  matchPihak,
  pihakOptions,
  tooltipStyle,
} from "./laporan-analytics-shared";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/**
 * Analitik Retur Pembelian / Retur Penjualan: rate tertaut, alasan, item.
 * Sumber: GET /api/laporan/transaksi-analytics?type=Retur ....
 * "Nilai" = nilai pokok (qty × unit_cost), BUKAN omzet.
 */
export function LaporanReturAnalytics({
  kind,
  from,
  to,
  warehouseId,
  enabled,
}: {
  kind: "pembelian" | "penjualan";
  from: string;
  to: string;
  warehouseId: number | null;
  enabled: boolean;
}) {
  const type: TransaksiAnalyticsType = kind === "pembelian" ? "Retur Pembelian" : "Retur Penjualan";
  const pihakLabel = kind === "pembelian" ? "Supplier" : "Customer";
  const [pihak, setPihak] = useState<string>(ALL);
  const { data, isLoading, isFetching } = useTransaksiAnalytics({
    type,
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

  const insight = useMemo(() => {
    if (!a) return null;
    const parts = [
      `Tingkat retur ${a.retur?.rate_qty ?? 0}% dari ${kind === "pembelian" ? "penerimaan" : "pengeluaran"} periode ini.`,
    ];
    const topAlasan = a.retur?.per_alasan?.[0];
    if (topAlasan)
      parts.push(`Alasan dominan: ${topAlasan.alasan} (${formatIDR(topAlasan.nilai)}).`);
    const bebas = a.retur?.tanpa_sumber_qty ?? 0;
    if (bebas > 0)
      parts.push(`${formatNumber(bebas)} unit retur tanpa dokumen sumber — telusuri manual.`);
    return parts.join(" ");
  }, [a, kind]);

  const handleExportCsv = () => {
    if (!a) return;
    const meta = [
      { keterangan: "Laporan", nilai: `Analitik Retur ${pihakLabel}` },
      { keterangan: "Periode", nilai: `${formatDate(from)} s.d. ${formatDate(to)}` },
      { keterangan: "Total Nilai Retur (pokok)", nilai: formatIDR(a.ringkasan.nilai) },
      { keterangan: "Tingkat Retur", nilai: `${a.retur?.rate_qty ?? 0}%` },
    ];
    const content =
      toCsv(meta, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.retur?.per_alasan ?? [], [
        { key: "alasan", label: "Alasan" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
        { key: "dokumen", label: "Dokumen" },
      ]) +
      "\r\n" +
      toCsv(a.retur?.per_item ?? [], [
        { key: "sku", label: "SKU" },
        { key: "nama", label: "Barang" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
      ]);
    downloadCsv(`analitik-retur-${kind}-${from}-${to}.csv`, content);
    toast.success("CSV analitik diunduh");
  };

  if (!enabled) return null;
  const title =
    kind === "pembelian" ? "Analitik Retur ke Supplier" : "Analitik Retur dari Customer";

  return (
    <>
      <PageHeader
        title={title}
        description="Nilai = nilai pokok (qty × unit_cost); rate tertaut ke dokumen sumber"
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
            placeholder={`Semua ${pihakLabel}`}
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
          label="Dokumen Retur"
          value={busy ? "…" : formatNumber(a!.ringkasan.dokumen)}
          icon={ClipboardList}
          loading={busy}
        />
        <StatCard
          label="Qty Retur"
          value={busy ? "…" : `${formatNumber(a!.ringkasan.qty)} unit`}
          icon={Package}
          tone="info"
          loading={busy}
        />
        <StatCard
          label="Nilai Retur"
          value={busy ? "…" : formatIDRCompact(a!.ringkasan.nilai)}
          icon={Wallet}
          tone="success"
          loading={busy}
          {...(busy ? {} : { valueTitle: formatIDR(a!.ringkasan.nilai) })}
        />
        <StatCard
          label="Tingkat Retur"
          value={busy ? "…" : `${a!.retur?.rate_qty ?? 0}%`}
          icon={Undo2}
          tone={(a?.retur?.rate_qty ?? 0) > 5 ? "danger" : "warning"}
          loading={busy}
        />
      </div>

      <Panel title={`Nilai Retur per Bulan per ${pihakLabel}`} description="Stacked per bulan">
        {busy ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <BulanNilaiChart rows={chartRows} />
        )}
      </Panel>

      <Panel title={`Top ${pihakLabel} Retur`} description="Peringkat + share kumulatif (Pareto)">
        <TopPihakTable rows={topRows} loading={busy} />
      </Panel>

      <Panel title={`Retur per ${pihakLabel} per Bulan`} description="Rincian bulanan">
        <PihakBulanTable rows={bulanRows} loading={busy} />
      </Panel>

      {(a?.retur?.per_alasan?.length ?? 0) > 0 && (
        <Panel
          title="Retur per Alasan"
          description={`Tertaut ${formatNumber(a!.retur!.tertaut_qty)} unit · tanpa sumber ${formatNumber(a!.retur!.tanpa_sumber_qty)} unit`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={a!.retur!.per_alasan}
                    dataKey="nilai"
                    nameKey="alasan"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    fontSize={11}
                  >
                    {a!.retur!.per_alasan.map((_, i) => (
                      <Cell
                        key={i}
                        fill={["var(--primary)", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8"][i % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [formatIDR(Number(v)), "Nilai"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Top Item Diretur</p>
              <DataTable
                columns={returItemColumns}
                rows={(a!.retur!.per_item ?? []).map((r) => ({
                  ...r,
                  id: `retur-item:${r.item_id}`,
                }))}
                pageSize={5}
                loading={busy}
                mobileCard={(r) => (
                  <div className="space-y-1">
                    <p className="truncate text-sm font-semibold">{r.nama}</p>
                    <p className="text-xs text-muted-foreground">{r.sku ?? "—"}</p>
                    <p className="text-xs font-semibold">
                      {formatNumber(r.qty)} {r.satuan ?? "unit"} · {formatIDR(r.nilai)}
                    </p>
                  </div>
                )}
              />
            </div>
          </div>
        </Panel>
      )}

      <AtRiskTable rows={a?.aktivitas ?? []} loading={busy} />
      <ProsesPanel proses={a?.proses} loading={busy} />
    </>
  );
}

const returItemColumns: Column<
  { id: string } & {
    item_id: number;
    sku: string | null;
    nama: string;
    satuan: string | null;
    qty: number;
    nilai: number;
  }
>[] = [
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
    key: "qty",
    label: "Qty Retur",
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
