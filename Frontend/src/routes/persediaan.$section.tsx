import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { TrxDetailSheet } from "@/components/wms/trx-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  formatDate,
  formatIDR,
  formatNumber,
  items,
  lowStock,
  transactions,
  type Trx,
} from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/$section")({
  head: ({ params }) => {
    const title = `${titleOf(params.section)} — KelolaGudang`;
    return {
      meta: [
        { title },
        { name: "description", content: `Halaman ${titleOf(params.section)} pada modul persediaan.` },
        { property: "og:title", content: title },
        { property: "og:description", content: `Data ${titleOf(params.section)} gudang.` },
      ],
    };
  },
  component: PersediaanSection,
});

function titleOf(slug: string) {
  return (
    {
      mutasi: "Mutasi Stock",
      "stock-minimum": "Stock Minimum",
      adjustment: "Stock Adjustment",
    }[slug] ?? "Persediaan"
  );
}

type Row = {
  id: string;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  unit: string;
  trx?: Trx | undefined;
  tone: "success" | "warning" | "danger" | "info";
  status: string;
};

const unitOf = (t: Trx) => {
  const set = new Set(t.lines.map((l) => l.unit));
  return set.size === 1 ? [...set][0]! : "Campuran";
};

function PersediaanSection() {
  const { section } = Route.useParams();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [detail, setDetail] = useState<Trx | null>(null);

  const { headers, data } = useMemo(() => {
    if (section === "stock-minimum") {
      return {
        headers: ["Barang", "SKU", "Gudang", "Stock", "Minimum"],
        data: lowStock.map<Row>((i) => ({
          id: i.id,
          a: i.name,
          b: i.sku,
          c: i.warehouse,
          d: `${formatNumber(i.stock)} ${i.unit}`,
          e: `${formatNumber(i.min)} ${i.unit}`,
          unit: i.unit,
          tone: "warning",
          status: "Perlu Restock",
        })),
      };
    }
    if (section === "adjustment") {
      return {
        headers: ["Nomor", "Tanggal", "Gudang", "Qty Penyesuaian", "Nilai"],
        data: transactions
          .filter((t) => t.type === "Stock Adjustment")
          .map<Row>((t) => ({
            id: t.id,
            a: t.no,
            b: formatDate(t.date),
            c: t.warehouse,
            d: `${formatNumber(t.qty)} ${unitOf(t)}`,
            e: formatIDR(t.value),
            unit: unitOf(t),
            trx: t,
            tone: t.status === "Selesai" ? "success" : "info",
            status: t.status,
          })),
      };
    }
    return {
      headers: ["Nomor", "Tanggal", "Jenis", "Gudang", "Qty"],
      data: transactions.slice(0, 400).map<Row>((t) => ({
        id: t.id,
        a: t.no,
        b: formatDate(t.date),
        c: t.type,
        d: t.warehouse,
        e: `${formatNumber(t.qty)} ${unitOf(t)}`,
        unit: unitOf(t),
        trx: t,
        tone: t.type === "Barang Masuk" ? "success" : t.type === "Barang Keluar" ? "warning" : "info",
        status: t.status,
      })),
    };
  }, [section]);

  const rows = data.filter((r) => `${r.a} ${r.b} ${r.c}`.toLowerCase().includes(debouncedQ.toLowerCase()));

  const columns: Column<Row>[] = [
    {
      key: "a",
      label: headers[0]!,
      render: (r) =>
        r.trx ? (
          <button
            type="button"
            onClick={() => setDetail(r.trx!)}
            className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            {r.a}
          </button>
        ) : (
          <span className="font-medium">{r.a}</span>
        ),
    },
    { key: "b", label: headers[1]!, render: (r) => r.b },
    { key: "c", label: headers[2]!, render: (r) => r.c },
    { key: "unit", label: "Satuan", render: (r) => <Pill tone="neutral">{r.unit}</Pill> },
    { key: "d", label: headers[3]!, className: "text-right", render: (r) => r.d },
    { key: "e", label: headers[4]!, className: "text-right", render: (r) => r.e },
    { key: "status", label: "Status", render: (r) => <Pill tone={r.tone}>{r.status}</Pill> },
  ];

  return (
    <>
      <PageHeader
        title={titleOf(section)}
        description={`${formatNumber(rows.length)} data dari ${formatNumber(items.length)} SKU`}
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Export diproses")}>
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />
      <Panel title="Data">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari..." className="rounded-xl pl-9" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          onRowClick={(r) => r.trx && setDetail(r.trx)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">{r.a}</p>
                <Pill tone={r.tone}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.b} · {r.c} · satuan {r.unit}
              </p>
              <p className="text-xs">
                {headers[3]}: <b>{r.d}</b> · {headers[4]}: <b>{r.e}</b>
              </p>
            </div>
          )}
        />
      </Panel>

      <TrxDetailSheet trx={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </>
  );
}