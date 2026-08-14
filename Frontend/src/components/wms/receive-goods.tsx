import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, PackageCheck, Plus, Search, Wallet } from "lucide-react";
import { ALL, FilterSelect, PageHeader, Panel, Pill, StatCard, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { StockDocumentSheet } from "./stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import { buildStockDocumentSearchText } from "@/lib/stock-document-search";
import { stockDocumentStatuses, type StockDocumentApi } from "@/lib/persediaan-types";

const statusTone = (s: StockDocumentApi["status"]): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

const isPoReceipt = (d: StockDocumentApi) => /^po[-/]/i.test((d.reference_no ?? "").trim());

export function ReceiveGoodsPage() {
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const { data, isLoading } = useStockDocuments({ type: "Penerimaan" });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useStockDocument(selectedId ?? undefined);

  const receipts = useMemo(() => (data?.data ?? []).filter(isPoReceipt), [data]);

  const suppliers = useMemo(
    () =>
      Array.from(new Set(receipts.map((d) => d.partner).filter((p): p is string => !!p))).sort(),
    [receipts],
  );

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const searchIndex = useMemo(
    () => new Map(receipts.map((d) => [d.id, buildStockDocumentSearchText(d)])),
    [receipts],
  );

  const rows = useMemo(
    () =>
      receipts.filter(
        (d) =>
          (!qn || searchIndex.get(d.id)!.includes(qn)) &&
          (wh === ALL || d.warehouse === wh) &&
          (partner === ALL || d.partner === partner) &&
          (status === ALL || d.status === status),
      ),
    [receipts, qn, searchIndex, wh, partner, status],
  );

  const draftDocs = rows.filter((d) => d.status === "Draft").length;
  const doneDocs = rows.filter((d) => d.status === "Selesai").length;
  const totalValue = rows.reduce((a, b) => a + (b.value_total ?? 0), 0);

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
      key: "partner",
      label: "Supplier",
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.partner ?? "—",
    },
    {
      key: "reference_no",
      label: "No. PO",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.reference_no ?? "—",
    },
    {
      key: "qty_total",
      label: "Qty",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.qty_total ?? 0,
      render: (r) => formatNumber(r.qty_total ?? 0),
    },
    {
      key: "value_total",
      label: "Nilai",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.value_total ?? 0,
      render: (r) => formatIDR(r.value_total ?? 0),
    },
    {
      key: "pic",
      label: "PIC",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.pic ?? "—",
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
        title="Receive Goods"
        description="Penerimaan barang berdasarkan Purchase Order"
        actions={
          canCreate && (
            <Button asChild className="rounded-xl">
              <Link to="/pengadaan/receive-goods/new">
                <Plus className="h-4 w-4" /> Terima Barang dari PO
              </Link>
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Dokumen" value={formatNumber(rows.length)} icon={PackageCheck} />
        <StatCard label="Draft" value={formatNumber(draftDocs)} icon={FileText} tone="warning" />
        <StatCard
          label="Selesai"
          value={formatNumber(doneDocs)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Nilai Total"
          value={formatIDRCompact(totalValue)}
          valueTitle={formatIDR(totalValue)}
          icon={Wallet}
          tone="info"
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, supplier, gudang, PIC, tanggal, No. PO, status..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full"
            value={partner}
            onChange={setPartner}
            placeholder="Semua Supplier"
            options={suppliers}
            loading={isLoading}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={[...stockDocumentStatuses]}
          />
        </div>
      </Panel>

      <Panel title="Daftar Penerimaan dari PO" description={`${formatNumber(rows.length)} dokumen`}>
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
              <p className="truncate text-xs">
                {r.partner ?? "—"} · No. PO {r.reference_no ?? "—"}
              </p>
              <div className="flex justify-between pt-1 text-xs">
                <span>{formatNumber(r.qty_total ?? 0)} unit</span>
                <b>{formatIDR(r.value_total ?? 0)}</b>
              </div>
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
