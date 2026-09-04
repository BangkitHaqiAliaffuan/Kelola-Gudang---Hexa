import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ALL, EmptyState, Panel, Pill, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import type { PihakJenis } from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";

export const PIHAK_LABEL: Record<PihakJenis, string> = {
  supplier: "Supplier",
  customer: "Customer",
  departemen: "Departemen",
  proyek: "Proyek",
  gudang: "Gudang",
  lainnya: "Lainnya",
};

export const PIHAK_TONE: Record<PihakJenis, Tone> = {
  supplier: "info",
  customer: "info",
  departemen: "brand",
  proyek: "warning",
  gudang: "success",
  lainnya: "neutral",
};

export const PIHAK_FILL: Record<PihakJenis, string> = {
  supplier: "var(--primary)",
  customer: "var(--primary)",
  departemen: "var(--primary-glow)",
  proyek: "#f59e0b",
  gudang: "#10b981",
  lainnya: "#94a3b8",
};

export const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--card)",
  fontSize: 12,
};

/** DataTable mewajibkan baris ber-`id`; id pihak analitik bisa null → id sintetis. */
export const withRowId = <T extends object>(rows: T[], key: (r: T, i: number) => string) =>
  rows.map((r, i) => ({ ...r, id: key(r, i) }));

export type PihakFilterValue = string;

export function pihakKeyOf(jenis: string, id: number | null, nama: string): string {
  return `${jenis}:${id ?? nama}`;
}

export function matchPihak(
  selected: string,
  jenis: string,
  id: number | null,
  nama: string,
): boolean {
  return selected === ALL || selected === pihakKeyOf(jenis, id, nama);
}

export function pihakOptions(
  aktivitas: { jenis: PihakJenis; id: number | null; nama: string }[],
): { value: string; label: string }[] {
  return aktivitas.map((r) => ({
    value: pihakKeyOf(r.jenis, r.id, r.nama),
    label: `${r.nama} — ${PIHAK_LABEL[r.jenis]}`,
  }));
}

/** Grafik nilai per bulan, ditumpuk per jenis pihak yang ada di data. */
export function BulanNilaiChart({
  rows,
}: {
  rows: { bulan: string; qty: number; nilai: number; dokumen: number; jenis?: string }[];
}) {
  if (rows.length === 0) {
    return <EmptyState title="Belum ada data" description="Tidak ada agregat pada filter ini." />;
  }
  const kinds = Array.from(new Set(rows.map((r) => r.jenis ?? "nilai")));
  const byBulan = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const key = r.bulan;
    let row = byBulan.get(key);
    if (!row) {
      row = { bulan: formatDate(`${key}-01`) };
      byBulan.set(key, row);
    }
    const k = r.jenis ?? "nilai";
    row[k] = (Number(row[k] ?? 0) as number) + r.nilai;
  }
  const data = [...byBulan.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([, row]) => row);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
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
        {kinds.length > 1 && <Legend fontSize={12} />}
        {kinds.map((k) => (
          <Bar
            key={k}
            dataKey={k}
            name={kinds.length > 1 ? (PIHAK_LABEL[k as PihakJenis] ?? k) : "Nilai"}
            stackId="nilai"
            fill={PIHAK_FILL[k as PihakJenis] ?? "var(--primary)"}
            radius={[0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export type TopPihakVM = {
  jenis: PihakJenis;
  id: number | null;
  nama: string;
  qty: number;
  nilai: number;
  dokumen: number;
  share: number;
  share_kumulatif: number;
};

const topPihakColumns: Column<{ id: string } & TopPihakVM>[] = [
  {
    key: "nama",
    label: "Pihak",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "jenis",
    label: "Jenis",
    sortable: true,
    render: (r) => <Pill tone={PIHAK_TONE[r.jenis]}>{PIHAK_LABEL[r.jenis]}</Pill>,
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

export function TopPihakTable({ rows, loading }: { rows: TopPihakVM[]; loading: boolean }) {
  return (
    <DataTable
      columns={topPihakColumns}
      rows={withRowId(rows, (r, i) => `${r.jenis}:${r.id ?? r.nama}:${i}`)}
      pageSize={10}
      loading={loading}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <p className="truncate text-sm font-semibold">{r.nama}</p>
            <Pill tone={PIHAK_TONE[r.jenis]}>{PIHAK_LABEL[r.jenis]}</Pill>
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
  );
}

export type PihakBulanVM = {
  jenis: PihakJenis;
  id: number | null;
  nama: string;
  bulan: string;
  qty: number;
  nilai: number;
  dokumen: number;
};

const pihakBulanColumns: Column<{ id: string } & PihakBulanVM>[] = [
  {
    key: "nama",
    label: "Pihak",
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

export function PihakBulanTable({ rows, loading }: { rows: PihakBulanVM[]; loading: boolean }) {
  return (
    <DataTable
      columns={pihakBulanColumns}
      rows={withRowId(rows, (r, i) => `${r.jenis}:${r.id ?? r.nama}:${r.bulan}:${i}`)}
      pageSize={12}
      loading={loading}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <p className="truncate text-sm font-semibold">{r.nama}</p>
            <span className="font-mono text-xs text-muted-foreground">{r.bulan}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(r.dokumen)} dokumen · {formatNumber(r.qty)} unit
          </p>
          <p className="text-xs font-semibold">{formatIDR(r.nilai)}</p>
        </div>
      )}
    />
  );
}

export type AktivitasVM = {
  jenis: PihakJenis;
  id: number | null;
  nama: string;
  dokumen: number;
  nilai: number;
  terakhir: string | null;
  hari_sejak_terakhir: number | null;
  status: string;
};

const atRiskColumns: Column<{ id: string } & AktivitasVM>[] = [
  {
    key: "nama",
    label: "Pihak",
    className: "min-w-[180px]",
    sortable: true,
    render: (r) => <span className="font-semibold">{r.nama}</span>,
  },
  {
    key: "jenis",
    label: "Jenis",
    sortable: true,
    render: (r) => (
      <Pill tone={PIHAK_TONE[r.jenis as PihakJenis] ?? "neutral"}>
        {PIHAK_LABEL[r.jenis as PihakJenis] ?? r.jenis}
      </Pill>
    ),
  },
  {
    key: "terakhir",
    label: "Terakhir",
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

export function AtRiskTable({ rows, loading }: { rows: AktivitasVM[]; loading: boolean }) {
  const atRisk = rows.filter((r) => r.status === "at-risk");
  if (atRisk.length === 0) return null;
  return (
    <Panel title="Pihak At-Risk" description="Tanpa transaksi > 90 hari — kandidat follow-up">
      <DataTable
        columns={atRiskColumns}
        rows={withRowId(atRisk, (r, i) => `atrisk:${r.jenis}:${r.id ?? r.nama}:${i}`)}
        pageSize={8}
        loading={loading}
        mobileCard={(r) => (
          <div className="space-y-1">
            <p className="truncate text-sm font-semibold">{r.nama}</p>
            <p className="text-xs text-muted-foreground">
              Terakhir {r.terakhir ? formatDate(r.terakhir) : "—"} · {r.hari_sejak_terakhir ?? "—"}{" "}
              hari lalu
            </p>
            <p className="text-xs font-semibold">{formatIDR(r.nilai)} historis</p>
          </div>
        )}
      />
    </Panel>
  );
}

export function ProsesPanel({
  proses,
  loading,
}: {
  proses:
    | {
        lead_median_hari: number | null;
        tertahan_dokumen: number;
        tertahan_nilai: number;
        aging: { rentang: string; dokumen: number; nilai: number }[];
      }
    | undefined;
  loading: boolean;
}) {
  if (!proses || (proses.tertahan_dokumen === 0 && proses.lead_median_hari == null)) return null;
  return (
    <Panel
      title="Kecepatan Proses"
      description={`Lead posting median ${proses.lead_median_hari ?? "—"} hari · ${formatNumber(proses.tertahan_dokumen)} dokumen tertahan (${formatIDR(proses.tertahan_nilai)})`}
    >
      <DataTable
        columns={[
          {
            key: "rentang",
            label: "Umur Tertahan",
            sortable: true,
            render: (r: { rentang: string; dokumen: number; nilai: number }) => (
              <span className="font-semibold">{r.rentang}</span>
            ),
          },
          {
            key: "dokumen",
            label: "Dokumen",
            className: "text-right",
            sortable: true,
            render: (r: { rentang: string; dokumen: number; nilai: number }) =>
              formatNumber(r.dokumen),
          },
          {
            key: "nilai",
            label: "Nilai",
            className: "text-right whitespace-nowrap",
            sortable: true,
            render: (r: { rentang: string; dokumen: number; nilai: number }) => formatIDR(r.nilai),
          },
        ]}
        rows={proses.aging.map((r, i) => ({ ...r, id: `aging:${i}` }))}
        pageSize={5}
        loading={loading}
        mobileCard={(r) => (
          <div className="flex justify-between text-sm">
            <span className="font-semibold">{r.rentang}</span>
            <span>
              {formatNumber(r.dokumen)} dok · {formatIDR(r.nilai)}
            </span>
          </div>
        )}
      />
    </Panel>
  );
}
