import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileBarChart, Maximize2, Minimize2, Plus, Search } from "lucide-react";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, Pill, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { StockDocumentSheet } from "./stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { cn } from "@/lib/utils";
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

export function BarangMasukPage() {
  const { hasModule, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const canViewLaporan = hasModule("Laporan");
  const { data, isLoading } = useStockDocuments({ type: "Penerimaan" });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);
  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || partner !== ALL || status !== ALL,
    [q, wh, partner, status],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    whFilter.reset();
    setPartner(ALL);
    setStatus(ALL);
  }, [whFilter]);

  const suppliers = useMemo(
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
      label: "Supplier",
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
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Barang Masuk"
          description="Penerimaan barang dari supplier"
          actions={
            canCreate && (
              <Button asChild className="rounded-xl">
                <Link to="/transaksi/entri/$section" params={{ section: "masuk" }}>
                  <Plus className="h-4 w-4" /> Buat Barang Masuk
                </Link>
              </Button>
            )
          }
        />

        <Panel title="Filter">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nomor, supplier, gudang, PIC, tanggal, referensi, status..."
                className="rounded-xl pl-9"
              />
            </div>
            <FilterSelect
              className="w-full flex-1 min-w-[140px] max-w-[180px]"
              value={wh}
              onChange={whFilter.onChange}
              placeholder="Semua Gudang"
              options={warehouses?.data.map((w) => w.name) ?? []}
              loading={warehousesLoading}
            />
            <FilterSelect
              className="w-full flex-1 min-w-[140px] max-w-[180px]"
              value={partner}
              onChange={setPartner}
              placeholder="Semua Supplier"
              options={suppliers}
              loading={isLoading}
            />
            <FilterSelect
              className="w-full flex-1 min-w-[140px] max-w-[180px]"
              value={status}
              onChange={setStatus}
              placeholder="Semua Status"
              options={[...stockDocumentStatuses]}
            />
            <div className="ml-auto flex shrink-0 items-end">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Daftar Penerimaan"
        description={`${formatNumber(rows.length)} dokumen`}
        actions={
          <>
            {canViewLaporan && (
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/laporan/$report" params={{ report: "barang-masuk" }}>
                  <FileBarChart className="h-4 w-4" /> Summary
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              aria-pressed={fullscreen}
              aria-label={fullscreen ? "Keluar mode layar penuh" : "Tampilkan layar penuh"}
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {fullscreen ? "Keluar" : "Fullscreen"}
            </Button>
          </>
        }
        className={cn(fullscreen && "fixed inset-0 z-40 flex flex-col !rounded-none !shadow-none")}
        bodyClassName={cn(fullscreen && "flex-1 overflow-auto")}
      >
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
                <span>{formatNumber(r.qty_total ?? 0)} unit</span>
                <b>{formatIDR(r.value_total ?? 0)}</b>
              </div>
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
