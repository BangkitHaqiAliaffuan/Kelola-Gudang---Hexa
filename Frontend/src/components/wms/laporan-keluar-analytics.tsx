import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Crown,
  FileSpreadsheet,
  HeartPulse,
  Timer,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ALL, EmptyState, FilterSelect, Panel, Pill, StatCard, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLaporanKeluarAnalytics } from "@/hooks/use-laporan";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { TujuanJenis } from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";

const JENIS_TONE: Record<TujuanJenis, Tone> = {
  customer: "info",
  departemen: "brand",
  proyek: "warning",
  lainnya: "neutral",
};

const JENIS_LABEL: Record<TujuanJenis, string> = {
  customer: "Customer",
  departemen: "Departemen",
  proyek: "Proyek",
  lainnya: "Lainnya",
};

const JENIS_FILL: Record<TujuanJenis, string> = {
  customer: "var(--primary)",
  departemen: "var(--primary-glow)",
  proyek: "#f59e0b",
  lainnya: "#94a3b8",
};

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--card)",
  fontSize: 12,
};

/** DataTable mewajibkan baris ber-`id`; id tujuan analitik bisa null → id sintetis. */
const withRowId = <T extends object>(rows: T[], key: (r: T, i: number) => string) =>
  rows.map((r, i) => ({ ...r, id: key(r, i) }));

/**
 * Panel analitik Barang Keluar — enrichment di atas tabel dokumen.
 * Sumber: GET /api/laporan/keluar-analytics (agregat server-side per
 * tujuan × bulan). "Nilai" = nilai pokok persediaan (qty × unit_cost).
 */
export function LaporanKeluarAnalytics({
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
  const [jenis, setJenis] = useState<string>(ALL);
  const [cari, setCari] = useState("");

  const { data, isLoading, isFetching } = useLaporanKeluarAnalytics({
    from,
    to,
    warehouseId,
    jenisTujuan: jenis === ALL ? null : (jenis as TujuanJenis),
    enabled,
  });
  const a = data?.data;
  const busy = isLoading || isFetching;

  const qn = cari.trim().toLowerCase();
  const matchNama = (nama: string) => !qn || nama.toLowerCase().includes(qn);

  const chartStack = useMemo(() => {
    if (!a) return [];
    const byBulan = new Map<string, Record<string, number | string>>();
    for (const r of a.per_tujuan_per_bulan) {
      if (!matchNama(r.nama)) continue;
      let row = byBulan.get(r.bulan);
      if (!row) {
        row = { bulan: r.bulan };
        byBulan.set(r.bulan, row);
      }
      row[r.jenis] = (Number(row[r.jenis] ?? 0) as number) + r.nilai;
    }
    return [...byBulan.entries()]
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .map(([bulan, row]) => ({ ...row, bulan: formatDate(`${bulan}-01`) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, qn]);

  const atRisk = useMemo(
    () => (a?.aktivitas ?? []).filter((r) => r.status === "at-risk" && matchNama(r.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, qn],
  );
  const topTujuan = useMemo(
    () => (a?.top_tujuan ?? []).filter((r) => matchNama(r.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, qn],
  );

  const insight = useMemo(() => {
    if (!a || a.top_tujuan.length === 0) return null;
    const top = a.top_tujuan[0]!;
    const parts = [
      `${top.nama} (${JENIS_LABEL[top.jenis]}) menyerap nilai terbesar: ${formatIDR(top.nilai)} (${top.share}% dari total).`,
    ];
    if (a.ringkasan.mom?.pct != null) {
      const dir = a.ringkasan.mom.pct >= 0 ? "naik" : "turun";
      parts.push(`Nilai bulan terakhir ${dir} ${Math.abs(a.ringkasan.mom.pct)}% MoM.`);
    }
    const risk = a.aktivitas.filter((r) => r.status === "at-risk").length;
    if (risk > 0) parts.push(`${risk} tujuan at-risk (tanpa order > 90 hari).`);
    if (a.retur.rate_nilai > 0)
      parts.push(`Tingkat retur ${a.retur.rate_nilai}% dari nilai keluar — cek panel retur.`);
    if (a.proses.tertahan_dokumen > 0)
      parts.push(
        `${a.proses.tertahan_dokumen} dokumen (${formatIDRCompact(a.proses.tertahan_nilai)}) belum diposting.`,
      );
    return parts.join(" ");
  }, [a]);

  const handleExportCsv = () => {
    if (!a) return;
    const meta = [
      { keterangan: "Laporan", nilai: "Analitik Barang Keluar" },
      { keterangan: "Periode", nilai: `${formatDate(from)} s.d. ${formatDate(to)}` },
      { keterangan: "Total Nilai (pokok)", nilai: formatIDR(a.ringkasan.nilai) },
      { keterangan: "Total Qty", nilai: formatNumber(a.ringkasan.qty) },
      { keterangan: "Dokumen", nilai: formatNumber(a.ringkasan.dokumen) },
      { keterangan: "Tingkat Retur", nilai: `${a.retur.rate_nilai}%` },
      { keterangan: "Omzet (customer)", nilai: formatIDR(a.omzet.total) },
      { keterangan: "Margin Kotor", nilai: formatIDR(a.omzet.margin) },
      { keterangan: "Omzet Bersih (setelah retur)", nilai: formatIDR(a.omzet.bersih) },
    ];
    const content =
      toCsv(meta, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.per_tujuan_per_bulan, [
        { key: "nama", label: "Tujuan" },
        { key: "jenis", label: "Jenis" },
        { key: "bulan", label: "Bulan" },
        { key: "dokumen", label: "Dokumen" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(a.omzet.per_customer_per_bulan, [
        { key: "nama", label: "Customer" },
        { key: "bulan", label: "Bulan" },
        { key: "dokumen", label: "Dokumen" },
        { key: "qty", label: "Qty" },
        { key: "omzet", label: "Omzet" },
        { key: "hpp", label: "HPP" },
        { key: "margin", label: "Margin" },
        { key: "margin_pct", label: "Margin %" },
      ]);
    downloadCsv(`analitik-barang-keluar-${from}-${to}.csv`, content);
    toast.success("CSV analitik diunduh");
  };

  if (!enabled) return null;

  const momPct = a?.ringkasan.mom?.pct ?? null;

  return (
    <>
      <Panel
        title="Analitik Tujuan"
        description="Nilai = nilai pokok persediaan (qty × unit_cost), dari dokumen Selesai"
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
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={jenis}
            onChange={setJenis}
            placeholder="Semua Jenis"
            options={["customer", "departemen", "proyek", "lainnya"]}
          />
          <Input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Saring nama tujuan..."
            className="rounded-xl max-w-[220px]"
          />
        </div>
        {insight && <p className="mb-3 text-sm text-muted-foreground">{insight}</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Tren Nilai MoM"
            value={busy || momPct == null ? "…" : `${momPct >= 0 ? "+" : ""}${momPct}%`}
            icon={momPct != null && momPct < 0 ? ArrowDownRight : ArrowUpRight}
            tone={momPct != null && momPct < 0 ? "danger" : "success"}
            loading={busy}
            valueTitle={
              a?.ringkasan.mom
                ? `Bulan ${a.ringkasan.mom.bulan} vs ${a.ringkasan.mom.bulan_lalu}`
                : undefined
            }
          />
          <StatCard
            label="Tingkat Retur"
            value={busy ? "…" : `${a!.retur.rate_nilai}%`}
            icon={Undo2}
            tone={a && a.retur.rate_nilai > 5 ? "danger" : "warning"}
            loading={busy}
            valueTitle={a ? `${formatIDR(a.retur.nilai)} diretur` : undefined}
          />
          <StatCard
            label="Tujuan At-Risk"
            value={
              busy ? "…" : formatNumber(a!.aktivitas.filter((r) => r.status === "at-risk").length)
            }
            icon={HeartPulse}
            tone="danger"
            loading={busy}
            valueTitle="Tanpa order > 90 hari"
          />
          <StatCard
            label="Lead Posting Median"
            value={
              busy || a?.proses.lead_median_hari == null
                ? "…"
                : `${a!.proses.lead_median_hari} hari`
            }
            icon={Timer}
            tone="info"
            loading={busy}
            valueTitle="Tanggal dokumen → posting"
          />
        </div>
      </Panel>

      <Panel title="Nilai per Bulan per Jenis Tujuan" description="Stacked per bulan">
        {chartStack.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartStack}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="bulan" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatIDRCompact(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [formatIDR(Number(value)), "Nilai"]}
              />
              <Legend fontSize={12} />
              {(Object.keys(JENIS_LABEL) as TujuanJenis[]).map((j) => (
                <Bar
                  key={j}
                  dataKey={j}
                  name={JENIS_LABEL[j]}
                  stackId="nilai"
                  fill={JENIS_FILL[j]}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Belum ada data" description="Tidak ada agregat pada filter ini." />
        )}
      </Panel>

      <Panel title="Top Tujuan" description="Peringkat penyerap nilai + share kumulatif (Pareto)">
        <DataTable
          columns={topColumns}
          rows={withRowId(topTujuan, (r, i) => `${r.jenis}:${r.id ?? r.nama}:${i}`)}
          pageSize={10}
          loading={busy}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.nama}</p>
                <Pill tone={JENIS_TONE[r.jenis]}>{JENIS_LABEL[r.jenis]}</Pill>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(r.dokumen)} dokumen · {formatNumber(r.qty)} unit
              </p>
              <p className="text-xs font-semibold">
                {formatIDR(r.nilai)} · {r.share}% (kum. {r.share_kumulatif}%)
              </p>
            </div>
          )}
        />
      </Panel>

      <Panel
        title="Omzet & Margin per Customer"
        description={`Margin = omzet − HPP, khusus customer (dept/proyek at-cost, dikecualikan). Cakupan harga: ${a ? `${a.omzet.cakupan.aktual} aktual · ${a.omzet.cakupan.estimasi} estimasi · ${a.omzet.cakupan.tanpa_harga} tanpa harga` : "…"}`}
      >
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Omzet"
            value={busy ? "…" : formatIDRCompact(a!.omzet.total)}
            icon={Wallet}
            tone="success"
            loading={busy}
            valueTitle={a ? formatIDR(a.omzet.total) : undefined}
          />
          <StatCard
            label="Margin Kotor"
            value={
              busy
                ? "…"
                : `${formatIDRCompact(a!.omzet.margin)}${a!.omzet.margin_pct != null ? ` (${a!.omzet.margin_pct}%)` : ""}`
            }
            icon={TrendingUp}
            tone={a && a.omzet.margin < 0 ? "danger" : "info"}
            loading={busy}
            valueTitle={a ? `HPP ${formatIDR(a.omzet.hpp)}` : undefined}
          />
          <StatCard
            label="Omzet Bersih"
            value={busy ? "…" : formatIDRCompact(a!.omzet.bersih)}
            icon={BadgeCheck}
            tone="brand"
            loading={busy}
            valueTitle={a ? `Setelah retur ${formatIDR(a.retur.omzet)}` : undefined}
          />
          <StatCard
            label="Top Margin"
            value={busy ? "…" : (a!.omzet.top_margin[0]?.nama ?? "—")}
            icon={Crown}
            tone="warning"
            loading={busy}
            valueTitle={
              a?.omzet.top_margin[0]
                ? `${formatIDR(a.omzet.top_margin[0].margin)} (${a.omzet.top_margin[0].margin_pct ?? "—"}%)`
                : undefined
            }
          />
        </div>
        <DataTable
          columns={marginColumns}
          rows={withRowId(
            (a?.omzet.top_margin ?? []).filter((r) => matchNama(r.nama)),
            (r, i) => `margin:${r.id ?? r.nama}:${i}`,
          )}
          pageSize={10}
          loading={busy}
          mobileCard={(r) => (
            <div className="space-y-1">
              <p className="truncate text-sm font-semibold">{r.nama}</p>
              <p className="text-xs text-muted-foreground">
                Omzet {formatIDR(r.omzet)} · HPP {formatIDR(r.hpp)}
              </p>
              <p className="text-xs font-semibold">
                Margin {formatIDR(r.margin)}
                {r.margin_pct != null ? ` (${r.margin_pct}%)` : ""} · share {r.share_omzet}%
              </p>
            </div>
          )}
        />
      </Panel>

      <Panel
        title="Omzet per Customer per Bulan"
        description="Jawaban 'nilai ke 1 customer dalam 1 bulan' dalam rupiah penjualan"
      >
        <DataTable
          columns={omzetBulanColumns}
          rows={withRowId(
            (a?.omzet.per_customer_per_bulan ?? []).filter((r) => matchNama(r.nama)),
            (r, i) => `omzet:${r.id ?? r.nama}:${r.bulan}:${i}`,
          )}
          pageSize={12}
          loading={busy}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.nama}</p>
                <span className="font-mono text-xs text-muted-foreground">{r.bulan}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(r.dokumen)} dokumen · {formatNumber(r.qty)} unit
              </p>
              <p className="text-xs font-semibold">
                Omzet {formatIDR(r.omzet)} · Margin {formatIDR(r.margin)}
                {r.margin_pct != null ? ` (${r.margin_pct}%)` : ""}
              </p>
            </div>
          )}
        />
      </Panel>

      {a && a.retur.qty > 0 && (
        <Panel
          title="Analisis Retur"
          description={`Tingkat retur ${a.retur.rate_nilai}% nilai · ${a.retur.rate_qty}% qty (tertaut ke dokumen sumber)`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Retur per Alasan</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={a.retur.per_alasan}
                    dataKey="nilai"
                    nameKey="alasan"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    label={(e) =>
                      `${e.alasan} (${a.retur.nilai > 0 ? Math.round((Number(e.nilai) / a.retur.nilai) * 100) : 0}%)`
                    }
                    fontSize={11}
                  >
                    {a.retur.per_alasan.map((_, i) => (
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
                rows={withRowId(
                  a.retur.per_item.filter((r) => matchNama(r.nama)),
                  (r) => `retur-item:${r.item_id}`,
                )}
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

      {atRisk.length > 0 && (
        <Panel
          title="Tujuan At-Risk"
          description="Tanpa order barang keluar > 90 hari — kandidat follow-up"
        >
          <DataTable
            columns={atRiskColumns}
            rows={withRowId(atRisk, (r, i) => `atrisk:${r.jenis}:${r.id ?? r.nama}:${i}`)}
            pageSize={8}
            loading={busy}
            mobileCard={(r) => (
              <div className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">{r.nama}</p>
                  <Pill tone={JENIS_TONE[r.jenis]}>{JENIS_LABEL[r.jenis]}</Pill>
                </div>
                <p className="text-xs text-muted-foreground">
                  Terakhir {r.terakhir ? formatDate(r.terakhir) : "—"} ·{" "}
                  {r.hari_sejak_terakhir ?? "—"} hari lalu
                </p>
                <p className="text-xs font-semibold">{formatIDR(r.nilai)} historis</p>
              </div>
            )}
          />
        </Panel>
      )}

      {a && a.proyek.length > 0 && (
        <Panel
          title="Serapan Proyek"
          description="Nilai keluar vs budget + qty vs target work order (flag > 5%)"
        >
          <div className="space-y-4">
            {a.proyek
              .filter((p) => matchNama(p.nama))
              .map((p) => (
                <div key={p.id ?? p.nama} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{p.nama}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatIDR(p.nilai_keluar)}
                      {p.budget != null &&
                        ` / budget ${formatIDR(p.budget)} (${p.serapan_budget_pct ?? "—"}%)`}
                    </p>
                  </div>
                  <DataTable
                    columns={proyekItemColumns}
                    rows={withRowId(p.items, (r) => `proyek-item:${p.id ?? p.nama}:${r.item_id}`)}
                    pageSize={5}
                    loading={busy}
                    mobileCard={(r) => (
                      <div className="space-y-1">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <p className="truncate text-sm font-semibold">{r.nama}</p>
                          {r.flag && <Pill tone="danger">Varians</Pill>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Target {formatNumber(r.target_qty)} · Keluar {formatNumber(r.keluar_qty)}{" "}
                          {r.satuan ?? ""}
                          {r.varians_pct != null && ` (${r.varians_pct}%)`}
                        </p>
                      </div>
                    )}
                  />
                </div>
              ))}
          </div>
        </Panel>
      )}
    </>
  );
}

const topColumns: Column<
  { id: string } & {
    jenis: TujuanJenis;
    id: number | null;
    nama: string;
    qty: number;
    nilai: number;
    dokumen: number;
    share: number;
    share_kumulatif: number;
  }
>[] = [
  {
    key: "nama",
    label: "Tujuan",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "jenis",
    label: "Jenis",
    sortable: true,
    render: (r) => <Pill tone={JENIS_TONE[r.jenis]}>{JENIS_LABEL[r.jenis]}</Pill>,
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
  {
    key: "share",
    label: "Share",
    className: "text-right",
    sortable: true,
    render: (r) => `${r.share}%`,
  },
  {
    key: "share_kumulatif",
    label: "Kum.",
    className: "text-right",
    sortable: true,
    render: (r) => `${r.share_kumulatif}%`,
  },
];

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

const atRiskColumns: Column<
  { id: string } & {
    jenis: TujuanJenis;
    id: number | null;
    nama: string;
    dokumen: number;
    nilai: number;
    terakhir: string | null;
    hari_sejak_terakhir: number | null;
    status: string;
  }
>[] = [
  {
    key: "nama",
    label: "Tujuan",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "jenis",
    label: "Jenis",
    sortable: true,
    render: (r) => <Pill tone={JENIS_TONE[r.jenis]}>{JENIS_LABEL[r.jenis]}</Pill>,
  },
  {
    key: "terakhir",
    label: "Order Terakhir",
    sortable: true,
    render: (r) => (r.terakhir ? formatDate(r.terakhir) : "—"),
  },
  {
    key: "hari_sejak_terakhir",
    label: "Hari Lalu",
    className: "text-right",
    sortable: true,
    sortAccessor: (r) => r.hari_sejak_terakhir ?? 0,
    render: (r) => formatNumber(r.hari_sejak_terakhir ?? 0),
  },
  {
    key: "nilai",
    label: "Nilai Historis",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.nilai),
  },
];

const proyekItemColumns: Column<
  { id: string } & {
    item_id: number;
    sku: string | null;
    nama: string;
    satuan: string | null;
    target_qty: number;
    keluar_qty: number;
    nilai_keluar: number;
    varians_pct: number | null;
    flag: boolean;
    work_order: string | null;
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
        <span className="block font-mono text-xs text-muted-foreground">
          {r.sku ?? "—"}
          {r.work_order ? ` · ${r.work_order}` : ""}
        </span>
      </span>
    ),
  },
  {
    key: "target_qty",
    label: "Target WO",
    className: "text-right",
    sortable: true,
    render: (r) => (r.target_qty > 0 ? formatNumber(r.target_qty) : "tanpa WO"),
  },
  {
    key: "keluar_qty",
    label: "Keluar",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.keluar_qty),
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
          tone={r.flag ? "danger" : "success"}
        >{`${r.varians_pct >= 0 ? "+" : ""}${r.varians_pct}%`}</Pill>
      ),
  },
];

const marginColumns: Column<
  { id: string } & {
    jenis: TujuanJenis;
    id: number | null;
    nama: string;
    qty: number;
    omzet: number;
    hpp: number;
    dokumen: number;
    margin: number;
    margin_pct: number | null;
    share_omzet: number;
  }
>[] = [
  {
    key: "nama",
    label: "Customer",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "omzet",
    label: "Omzet",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.omzet),
  },
  {
    key: "hpp",
    label: "HPP",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.hpp),
  },
  {
    key: "margin",
    label: "Margin",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => (
      <span className={r.margin < 0 ? "text-destructive" : ""}>{formatIDR(r.margin)}</span>
    ),
  },
  {
    key: "margin_pct",
    label: "Margin %",
    className: "text-right",
    sortable: true,
    sortAccessor: (r) => r.margin_pct ?? -9999,
    render: (r) =>
      r.margin_pct == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Pill tone={r.margin_pct < 0 ? "danger" : "success"}>{`${r.margin_pct}%`}</Pill>
      ),
  },
  {
    key: "share_omzet",
    label: "Share",
    className: "text-right",
    sortable: true,
    render: (r) => `${r.share_omzet}%`,
  },
];

const omzetBulanColumns: Column<
  { id: string } & {
    jenis: TujuanJenis;
    id: number | null;
    nama: string;
    bulan: string;
    qty: number;
    omzet: number;
    hpp: number;
    margin: number;
    margin_pct: number | null;
    dokumen: number;
  }
>[] = [
  {
    key: "nama",
    label: "Customer",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "bulan",
    label: "Bulan",
    className: "whitespace-nowrap",
    sortable: true,
    render: (r) => <span className="font-mono text-xs">{formatDate(`${r.bulan}-01`)}</span>,
  },
  {
    key: "dokumen",
    label: "Dok",
    className: "text-right",
    sortable: true,
    render: (r) => formatNumber(r.dokumen),
  },
  {
    key: "omzet",
    label: "Omzet",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.omzet),
  },
  {
    key: "hpp",
    label: "HPP",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => formatIDR(r.hpp),
  },
  {
    key: "margin",
    label: "Margin",
    className: "text-right whitespace-nowrap",
    sortable: true,
    render: (r) => (
      <span className={r.margin < 0 ? "text-destructive" : ""}>{formatIDR(r.margin)}</span>
    ),
  },
  {
    key: "margin_pct",
    label: "Margin %",
    className: "text-right",
    sortable: true,
    sortAccessor: (r) => r.margin_pct ?? -9999,
    render: (r) =>
      r.margin_pct == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Pill tone={r.margin_pct < 0 ? "danger" : "success"}>{`${r.margin_pct}%`}</Pill>
      ),
  },
];
