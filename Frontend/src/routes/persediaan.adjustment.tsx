import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel, Pill, type Tone } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { stockDocumentStatuses, type StockDocumentApi } from "@/lib/persediaan-types";

const ADJUSTMENT_TYPE = "Stock Adjustment";

export const Route = createFileRoute("/persediaan/adjustment")({
  head: () => ({
    meta: [
      { title: "Stock Adjustment — KelolaGudang" },
      {
        name: "description",
        content: "Dokumen penyesuaian stok: koreksi selisih stok fisik vs sistem.",
      },
      { property: "og:title", content: "Stock Adjustment — KelolaGudang" },
      { property: "og:description", content: "Riwayat penyesuaian stok dari ledger." },
    ],
  }),
  component: StockAdjustment,
});

const statusTone = (s: StockDocumentApi["status"]): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

function StockAdjustment() {
  const { data, isLoading } = useStockDocuments({ type: ADJUSTMENT_TYPE });
  const { data: warehouses } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useStockDocument(selectedId ?? undefined);

  const dayOk = (day: string) => {
    if (dateFrom && dateTo) return day >= dateFrom && day <= dateTo;
    if (dateFrom) return day === dateFrom;
    if (dateTo) return day === dateTo;
    return true;
  };

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter((d) => {
        const day = d.document_date.slice(0, 10);
        return (
          (!debouncedQ ||
            `${d.no} ${d.partner ?? ""} ${d.note ?? ""}`
              .toLowerCase()
              .includes(debouncedQ.toLowerCase())) &&
          (status === ALL || d.status === status) &&
          (wh === ALL || d.warehouse === wh) &&
          dayOk(day)
        );
      }),
    [data, debouncedQ, status, wh, dateFrom, dateTo],
  );

  const columns: Column<StockDocumentApi>[] = [
    {
      key: "no",
      label: "Nomor",
      className: "w-[170px] whitespace-nowrap",
      sortable: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.no}</span>,
    },
    {
      key: "document_date",
      label: "Tanggal",
      className: "w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatDate(r.document_date),
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "line_count",
      label: "Baris",
      className: "text-right w-[80px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.line_count),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Adjustment"
        description="Dokumen penyesuaian stok yang telah diposting ke ledger"
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => toast.success("Export Excel diproses")}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />
      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, partner, catatan..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={[...stockDocumentStatuses]}
          />
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Dari Tanggal
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-xl"
              aria-label="Dari tanggal"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Sampai Tanggal
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-xl"
              aria-label="Sampai tanggal"
            />
          </div>
        </div>
      </Panel>
      <Panel title="Daftar Penyesuaian" description={`${formatNumber(rows.length)} dokumen`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => setSelectedId(r.id)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(r.document_date)} · {r.warehouse ?? "—"}
              </p>
              <p className="text-xs">{formatNumber(r.line_count)} baris</p>
            </div>
          )}
        />
      </Panel>

      <StockDocumentSheet
        doc={detail?.data ?? null}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
