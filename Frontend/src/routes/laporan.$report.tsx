import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  formatDate,
  formatIDR,
  formatNumber,
  items,
  monthly,
  totalValue,
  transactions,
  warehouses,
} from "@/lib/wms-data";
import { Boxes, Wallet, TrendingUp } from "lucide-react";

const titles: Record<string, string> = {
  stock: "Laporan Stock",
  "barang-masuk": "Laporan Barang Masuk",
  "barang-keluar": "Laporan Barang Keluar",
  mutasi: "Laporan Mutasi",
  "kartu-stock": "Laporan Kartu Stock",
  "nilai-persediaan": "Laporan Nilai Persediaan",
  "stock-minimum": "Laporan Stock Minimum",
  "stock-opname": "Laporan Stock Opname",
  "dead-stock": "Laporan Barang Tidak Bergerak",
  "fast-moving": "Laporan Fast Moving Item",
};

export const Route = createFileRoute("/laporan/$report")({
  head: ({ params }) => {
    const title = `${titles[params.report] ?? "Laporan"} — KelolaGudang`;
    return {
      meta: [
        { title },
        { name: "description", content: "Laporan gudang lengkap dengan filter, chart, dan export." },
        { property: "og:title", content: title },
        { property: "og:description", content: "Analisis data gudang siap cetak." },
      ],
    };
  },
  component: Laporan,
});

type Row = { id: string; a: string; b: string; c: string; d: string; e: string };

function Laporan() {
  const { report } = Route.useParams();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);

  const isItemReport = ["stock", "stock-minimum", "dead-stock", "fast-moving", "nilai-persediaan"].includes(report);

  const source: Row[] = isItemReport
    ? items
        .filter((i) =>
          report === "dead-stock"
            ? i.moving === "Dead"
            : report === "fast-moving"
              ? i.moving === "Fast"
              : report === "stock-minimum"
                ? i.stock <= i.min
                : true,
        )
        .map((i) => ({
          id: i.id,
          a: i.name,
          b: i.sku,
          c: i.warehouse,
          d: `${formatNumber(i.stock)} ${i.unit}`,
          e: formatIDR(i.stock * i.cost),
        }))
    : transactions.slice(0, 500).map((t) => ({
        id: t.id,
        a: t.no,
        b: formatDate(t.date),
        c: t.warehouse,
        d: formatNumber(t.qty),
        e: formatIDR(t.value),
      }));

  const rows = source.filter(
    (r) => `${r.a} ${r.b}`.toLowerCase().includes(debouncedQ.toLowerCase()) && (wh === ALL || r.c === wh),
  );

  const headers = isItemReport
    ? ["Barang", "SKU", "Gudang", "Stock", "Nilai"]
    : ["Nomor", "Tanggal", "Gudang", "Qty", "Nilai"];

  const columns: Column<Row>[] = headers.map((h, i) => ({
    key: String(i),
    label: h,
    className: i > 2 ? "text-right" : "",
    render: (r) => <span className={i === 0 ? "font-medium" : ""}>{[r.a, r.b, r.c, r.d, r.e][i]}</span>,
  }));

  return (
    <>
      <PageHeader
        title={titles[report] ?? "Laporan"}
        description="Periode Agustus 2025 – Juli 2026"
        actions={
          <>
            <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Excel diunduh")}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => toast.success("PDF diunduh")}>
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button className="rounded-xl" onClick={() => toast.success("Dikirim ke printer")}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Baris" value={formatNumber(rows.length)} icon={Boxes} />
        <StatCard label="Total SKU" value={formatNumber(items.length)} icon={Boxes} tone="info" />
        <StatCard label="Nilai Persediaan" value={formatIDR(totalValue)} icon={Wallet} tone="success" />
        <StatCard label="Rata-rata Bulanan" value={formatNumber(Math.round(monthly.reduce((a, b) => a + b.masuk, 0) / 12))} icon={TrendingUp} tone="warning" />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari..." className="rounded-xl pl-9" />
          </div>
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses.map((w) => w.name)}
          />
          <Input type="date" defaultValue="2026-07-01" className="rounded-xl" />
        </div>
      </Panel>

      <Panel title="Grafik Ringkasan">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
            />
            <Bar dataKey="masuk" name="Masuk" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="keluar" name="Keluar" fill="var(--primary-glow)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Detail Laporan" description={`${formatNumber(rows.length)} baris`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          mobileCard={(r) => (
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
          )}
        />
      </Panel>
    </>
  );
}