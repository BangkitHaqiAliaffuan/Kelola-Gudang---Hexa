import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import {
  stockDocumentStatuses,
  stockDocumentTypes,
  type StockDocumentApi,
  type StockDocumentType,
} from "@/lib/persediaan-types";

export const Route = createFileRoute("/persediaan/mutasi")({
  head: () => ({
    meta: [
      { title: "Mutasi Stock — KelolaGudang" },
      {
        name: "description",
        content:
          "Daftar dokumen mutasi stock: penerimaan, pengeluaran, transfer, penyesuaian, dan opname.",
      },
      { property: "og:title", content: "Mutasi Stock — KelolaGudang" },
      { property: "og:description", content: "Dokumen mutasi stock lengkap dari ledger." },
    ],
  }),
  component: MutasiStock,
});

const typeTone = (t: StockDocumentType): Tone =>
  t === "Penerimaan"
    ? "success"
    : t === "Pengeluaran"
      ? "warning"
      : t === "Stock Adjustment"
        ? "warning"
        : "info";

const statusTone = (s: StockDocumentApi["status"]): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

function MutasiStock() {
  const { data, isLoading } = useStockDocuments();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const { user } = useAuth();
  useEffect(() => {
    if (warehousesLoading) return;
    const def = user?.default_warehouse_id;
    if (!def || wh !== ALL) return;
    const name = warehouses?.data.find((w) => w.id === def)?.name;
    if (name) setWh(name);
  }, [warehousesLoading, warehouses, user, wh]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);
  const hasActiveFilters = useMemo(
    () => q !== "" || type !== ALL || status !== ALL || wh !== ALL,
    [q, type, status, wh],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setType(ALL);
    setStatus(ALL);
    setWh(ALL);
  }, []);

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (d) =>
          (!debouncedQ ||
            `${d.no} ${d.partner ?? ""} ${d.note ?? ""}`
              .toLowerCase()
              .includes(debouncedQ.toLowerCase())) &&
          (type === ALL || d.type === type) &&
          (status === ALL || d.status === status) &&
          (wh === ALL || d.warehouse === wh),
      ),
    [data, debouncedQ, type, status, wh],
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
      key: "type",
      label: "Jenis",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={typeTone(r.type)}>{r.type}</Pill>,
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) =>
        r.destination ? `${r.warehouse ?? "—"} → ${r.destination}` : (r.warehouse ?? "—"),
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
        title="Mutasi Stock"
        description="Dokumen mutasi stock yang telah diposting ke ledger"
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, partner, catatan..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={type}
            onChange={setType}
            placeholder="Semua Jenis"
            options={[...stockDocumentTypes]}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={[...stockDocumentStatuses]}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>
      <Panel title="Daftar Dokumen" description={`${formatNumber(rows.length)} dokumen`}>
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
                {formatDate(r.document_date)} · {r.type}
              </p>
              <p className="text-xs">
                <b>{r.warehouse ?? "—"}</b>
                {r.destination ? ` → ${r.destination}` : ""} · {formatNumber(r.line_count)} baris
              </p>
            </div>
          )}
        />
      </Panel>

      <StockDocumentSheet
        doc={detail?.data ?? null}
        isLoading={detailLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
