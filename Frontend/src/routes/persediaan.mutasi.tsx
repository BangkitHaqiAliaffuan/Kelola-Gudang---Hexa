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
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument } from "@/hooks/use-persediaan";
import { useServerTable } from "@/hooks/use-server-table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/api";
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

const PAGE_SIZE = 12;

function MutasiStock() {
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);

  // Kembali ke halaman 1 setiap kali filter berubah (Fase 4: paginasi server).
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, type, status, wh]);

  // FilterSelect memakai nama; server butuh id.
  const warehouseId = wh === ALL ? null : (warehouses?.data.find((w) => w.name === wh)?.id ?? null);
  const queryFilters = useMemo(
    () => ({
      type: type === ALL ? null : type,
      status: status === ALL ? null : status,
      warehouse_id: warehouseId,
    }),
    [type, status, warehouseId],
  );

  const { rows, total, lastPage, isLoading, error, refetch } = useServerTable<StockDocumentApi>(
    ["persediaan", "stock-documents"],
    "/persediaan/stock-documents",
    {
      page,
      perPage: PAGE_SIZE,
      search: debouncedQ || null,
      filters: queryFilters,
    },
  );

  const hasActiveFilters = useMemo(
    () => q !== "" || type !== ALL || status !== ALL || wh !== ALL,
    [q, type, status, wh],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setType(ALL);
    setStatus(ALL);
    whFilter.reset();
  }, [whFilter]);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Export mencakup SEMUA baris terfilter (bukan 1 halaman): fetchAll terpisah (Fase 4).
      const params: Record<string, string> = {};
      if (debouncedQ) params["search"] = debouncedQ;
      if (type !== ALL) params["type"] = type;
      if (status !== ALL) params["status"] = status;
      if (warehouseId != null) params["warehouse_id"] = String(warehouseId);
      const res = await fetchAll<StockDocumentApi>("/persediaan/stock-documents", params);
      const content = toCsv(
        res.data.map((d) => ({
          no: d.no,
          tanggal: formatDate(d.document_date),
          jenis: d.type,
          gudang: d.destination ? `${d.warehouse ?? "—"} → ${d.destination}` : (d.warehouse ?? "—"),
          baris: d.line_count,
          status: d.status,
          partner: d.partner ?? "—",
          catatan: d.note ?? "—",
        })),
        [
          { key: "no", label: "Nomor" },
          { key: "tanggal", label: "Tanggal" },
          { key: "jenis", label: "Jenis" },
          { key: "gudang", label: "Gudang" },
          { key: "baris", label: "Baris" },
          { key: "status", label: "Status" },
          { key: "partner", label: "Partner" },
          { key: "catatan", label: "Catatan" },
        ],
      );
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`mutasi-stock-${today}.csv`, content);
      toast.success(`Export ${res.data.length} dokumen`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export gagal.");
    } finally {
      setExporting(false);
    }
  }, [debouncedQ, type, status, warehouseId]);

  // Sort header nonaktif: backend mengurutkan document_date desc tetap dan
  // tidak menyediakan param sort — sort client atas 1 halaman menyesatkan (Fase 4).
  const columns: Column<StockDocumentApi>[] = [
    {
      key: "no",
      label: "Nomor",
      className: "w-[170px] whitespace-nowrap",
      render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.no}</span>,
    },
    {
      key: "document_date",
      label: "Tanggal",
      className: "w-[130px] whitespace-nowrap",
      render: (r) => formatDate(r.document_date),
    },
    {
      key: "type",
      label: "Jenis",
      className: "min-w-[140px] whitespace-nowrap",
      render: (r) => <Pill tone={typeTone(r.type)}>{r.type}</Pill>,
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[150px] whitespace-nowrap",
      render: (r) =>
        r.destination ? `${r.warehouse ?? "—"} → ${r.destination}` : (r.warehouse ?? "—"),
    },
    {
      key: "line_count",
      label: "Baris",
      className: "text-right w-[80px] whitespace-nowrap",
      render: (r) => formatNumber(r.line_count),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[150px] whitespace-nowrap",
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
            onClick={handleExport}
            disabled={rows.length === 0 || isLoading || exporting}
          >
            <Download className="h-4 w-4" /> {exporting ? "Mengekspor..." : "Export"}
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
            onChange={whFilter.onChange}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
      </Panel>
      <Panel title="Daftar Dokumen" description={`${formatNumber(total)} dokumen`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={PAGE_SIZE}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          onRowClick={(r) => setSelectedId(r.id)}
          serverPage={page}
          serverTotalRows={total}
          serverTotalPages={lastPage}
          onServerPageChange={setPage}
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
