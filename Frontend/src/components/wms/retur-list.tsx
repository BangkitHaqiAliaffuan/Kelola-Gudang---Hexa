import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { ALL, FilterSelect, PageHeader, Panel, Pill, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { StockDocumentSheet } from "./stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
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

type ReturListProps = {
  type: "Retur Pembelian" | "Retur Penjualan";
  title: string;
  description: string;
  partnerLabel: string;
  createLabel: string;
  createSection: string;
};

function ReturListPage({
  type,
  title,
  description,
  partnerLabel,
  createLabel,
  createSection,
}: ReturListProps) {
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const { data, isLoading } = useStockDocuments({ type });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useStockDocument(selectedId ?? undefined);

  const partners = useMemo(
    () =>
      Array.from(
        new Set((data?.data ?? []).map((d) => d.partner).filter((p): p is string => !!p)),
      ).sort(),
    [data],
  );

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const searchIndex = useMemo(
    () => new Map((data?.data ?? []).map((d) => [d.id, buildStockDocumentSearchText(d)])),
    [data],
  );

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (d) =>
          (!qn || searchIndex.get(d.id)!.includes(qn)) &&
          (wh === ALL || d.warehouse === wh) &&
          (partner === ALL || d.partner === partner) &&
          (status === ALL || d.status === status),
      ),
    [data, qn, searchIndex, wh, partner, status],
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
      key: "partner",
      label: partnerLabel,
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.partner ?? "—",
    },
    {
      key: "reference_no",
      label: "Referensi",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.reference_no ?? "—",
    },
    {
      key: "qty_total",
      label: "Qty",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => Math.abs(r.qty_total ?? 0),
      render: (r) => formatNumber(Math.abs(r.qty_total ?? 0)),
    },
    {
      key: "value_total",
      label: "Nilai",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => Math.abs(r.value_total ?? 0),
      render: (r) => formatIDR(Math.abs(r.value_total ?? 0)),
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
        title={title}
        description={description}
        actions={
          canCreate && (
            <Button asChild className="rounded-xl">
              <Link to="/transaksi/entri/$section" params={{ section: createSection }}>
                <Plus className="h-4 w-4" /> Buat {createLabel}
              </Link>
            </Button>
          )
        }
      />

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, partner, gudang, PIC, tanggal, referensi, status..."
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
            placeholder={`Semua ${partnerLabel}`}
            options={partners}
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

      <Panel title={`Daftar ${title}`} description={`${formatNumber(rows.length)} dokumen`}>
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
              <p className="truncate text-xs">{r.partner ?? "—"}</p>
              <div className="flex justify-between pt-1 text-xs">
                <span>{formatNumber(Math.abs(r.qty_total ?? 0))} unit</span>
                <b>{formatIDR(Math.abs(r.value_total ?? 0))}</b>
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

export function ReturPembelianPage() {
  return (
    <ReturListPage
      type="Retur Pembelian"
      title="Retur Pembelian"
      description="Pengembalian barang ke supplier"
      partnerLabel="Supplier"
      createLabel="Retur Pembelian"
      createSection="retur-pembelian"
    />
  );
}

export function ReturPenjualanPage() {
  return (
    <ReturListPage
      type="Retur Penjualan"
      title="Retur Penjualan"
      description="Penerimaan barang retur dari customer"
      partnerLabel="Customer"
      createLabel="Retur Penjualan"
      createSection="retur-penjualan"
    />
  );
}
