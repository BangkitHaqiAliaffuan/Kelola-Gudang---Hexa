import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { FileBarChart, Download, Maximize2, Minimize2, Plus, Search } from "lucide-react";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, Pill, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { StockDocumentSheet } from "./stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useWarehouses } from "@/hooks/use-master";
import {
  useCancelStockDocument,
  usePostStockDocument,
  useStockDocument,
  useStockDocuments,
} from "@/hooks/use-persediaan";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/lib/csv";
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
  reportSlug: "retur-pembelian" | "retur-penjualan";
  /** Deep-link ?doc=<id> dari GlobalSearch (diteruskan wrapper route). */
  docId?: number | undefined;
  /** Dipanggil saat sheet ditutup agar wrapper membersihkan ?doc= di URL. */
  onCloseDoc?: () => void;
};

function ReturListPage({
  type,
  title,
  description,
  partnerLabel,
  createLabel,
  createSection,
  reportSlug,
  docId,
  onCloseDoc,
}: ReturListProps) {
  const { hasModule, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const canPost = hasModuleLevel("Persediaan", "Tulis");
  const canCancel = hasModuleLevel("Persediaan", "Kelola");
  const canViewLaporan = hasModule("Laporan");
  const { data, isLoading, error, refetch } = useStockDocuments({ type });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  // Filter gudang: pilihan tersimpan per user → default user → Semua.
  const whFilter = useWarehouseFilter(warehouses?.data);
  const wh = whFilter.value;
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Deep-link ?doc=<id> dari GlobalSearch: buka sheet dokumen; sinkronisasi
  // via efek karena navigasi satu-route tidak me-remount komponen.
  useEffect(() => {
    if (docId != null) setSelectedId(docId);
  }, [docId]);
  const closeSheet = useCallback(
    (o: boolean) => {
      if (!o) {
        setSelectedId(null);
        onCloseDoc?.();
      }
    },
    [onCloseDoc],
  );
  const [fullscreen, setFullscreen] = useState(false);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);
  const postDoc = usePostStockDocument();
  const cancelDoc = useCancelStockDocument();
  const [confirmPostId, setConfirmPostId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  const doPost = async () => {
    if (confirmPostId == null) return;
    try {
      const res = await postDoc.mutateAsync(confirmPostId);
      toast.success(`Dokumen ${res.data.no} berhasil diposting`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConfirmPostId(null);
    }
  };

  const doCancel = async () => {
    if (confirmCancelId == null) return;
    try {
      const res = await cancelDoc.mutateAsync(confirmCancelId);
      toast.success(`Dokumen ${res.data.no} dibatalkan`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConfirmCancelId(null);
    }
  };

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

  const exportCsv = () => {
    downloadCsv(
      `${reportSlug}.csv`,
      toCsv(
        rows.map((r) => ({
          no: r.no,
          tanggal: r.document_date ?? "",
          gudang: r.warehouse ?? "",
          pihak: r.partner ?? "",
          referensi: r.reference_no ?? "",
          qty: Math.abs(r.qty_total ?? 0),
          nilai: Math.abs(r.value_total ?? 0),
          pic: r.pic ?? "",
          status: r.status,
        })),
        [
          { key: "no", label: "Nomor" },
          { key: "tanggal", label: "Tanggal" },
          { key: "gudang", label: "Gudang" },
          { key: "pihak", label: partnerLabel },
          { key: "referensi", label: "Referensi" },
          { key: "qty", label: "Qty" },
          { key: "nilai", label: "Nilai" },
          { key: "pic", label: "PIC" },
          { key: "status", label: "Status" },
        ],
      ),
    );
    toast.success(`Data ${title} diekspor ke CSV`);
  };

  return (
    <>
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title={title}
          description={description}
          actions={
            <>
              <Button variant="outline" className="rounded-xl" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                Export
              </Button>
              {canCreate && (
                <Button asChild className="rounded-xl">
                  <Link to="/transaksi/entri/$section" params={{ section: createSection }}>
                    <Plus className="h-4 w-4" /> Buat {createLabel}
                  </Link>
                </Button>
              )}
            </>
          }
        />

        <Panel title="Filter">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nomor, partner, gudang, PIC, tanggal, referensi, status..."
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
              placeholder={`Semua ${partnerLabel}`}
              options={partners}
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
        title={`Daftar ${title}`}
        description={`${formatNumber(rows.length)} dokumen`}
        actions={
          <>
            {canViewLaporan && (
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/laporan/$report" params={{ report: reportSlug }}>
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
          error={error}
          onRetry={() => refetch()}
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
        isLoading={detailLoading}
        onOpenChange={closeSheet}
        onPost={canPost ? () => detail?.data && setConfirmPostId(detail.data.id) : undefined}
        onCancel={canCancel ? () => detail?.data && setConfirmCancelId(detail.data.id) : undefined}
        busy={postDoc.isPending || cancelDoc.isPending}
      />

      <AlertDialog open={confirmPostId != null} onOpenChange={(o) => !o && setConfirmPostId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Posting dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen akan diposting dan stok langsung ter-update. Tindakan ini tidak dapat
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Batal</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => void doPost()}>
              Ya, Posting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCancelId != null}
        onOpenChange={(o) => !o && setConfirmCancelId(null)}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen Draft akan dibatalkan dan tidak dapat diposting lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Kembali</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => void doCancel()}>
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const returPembelianRouteApi = getRouteApi("/transaksi/retur-pembelian");
const returPenjualanRouteApi = getRouteApi("/transaksi/retur-penjualan");

export function ReturPembelianPage() {
  const search = returPembelianRouteApi.useSearch();
  const navigate = returPembelianRouteApi.useNavigate();
  const clearDoc = useCallback(
    () =>
      navigate({
        search: (p) => {
          const { doc: _cleared, ...rest } = p;
          return rest;
        },
      }),
    [navigate],
  );
  return (
    <ReturListPage
      type="Retur Pembelian"
      title="Retur Pembelian"
      description="Pengembalian barang ke supplier"
      partnerLabel="Supplier"
      createLabel="Retur Pembelian"
      createSection="retur-pembelian"
      reportSlug="retur-pembelian"
      docId={search.doc}
      onCloseDoc={clearDoc}
    />
  );
}

export function ReturPenjualanPage() {
  const search = returPenjualanRouteApi.useSearch();
  const navigate = returPenjualanRouteApi.useNavigate();
  const clearDoc = useCallback(
    () =>
      navigate({
        search: (p) => {
          const { doc: _cleared, ...rest } = p;
          return rest;
        },
      }),
    [navigate],
  );
  return (
    <ReturListPage
      type="Retur Penjualan"
      title="Retur Penjualan"
      description="Penerimaan barang retur dari customer"
      partnerLabel="Customer"
      createLabel="Retur Penjualan"
      createSection="retur-penjualan"
      reportSlug="retur-penjualan"
      docId={search.doc}
      onCloseDoc={clearDoc}
    />
  );
}
