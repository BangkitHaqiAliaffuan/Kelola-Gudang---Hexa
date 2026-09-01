import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Download, Plus, Search, TriangleAlert } from "lucide-react";
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
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/use-master";
import {
  useApproveStockDocument,
  useCancelStockDocument,
  usePostStockDocument,
  useRejectStockDocument,
  useStockDocument,
  useStockDocuments,
  useSubmitStockDocumentApproval,
} from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { stockDocumentStatuses, type StockDocumentApi } from "@/lib/persediaan-types";

const ADJUSTMENT_TYPE = "Stock Adjustment";

export const Route = createFileRoute("/persediaan/adjustment/")({
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
        : s === "Menunggu Approval"
          ? "warning"
          : "warning";

function StockAdjustment() {
  const { data, isLoading } = useStockDocuments({ type: ADJUSTMENT_TYPE });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const canWrite = hasModuleLevel("Persediaan", "Tulis");
  const canCancel = hasModuleLevel("Persediaan", "Kelola");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const hasActiveFilters = useMemo(
    () => q !== "" || status !== ALL || wh !== ALL || dateFrom !== "" || dateTo !== "",
    [q, status, wh, dateFrom, dateTo],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setStatus(ALL);
    setWh(ALL);
    setDateFrom("");
    setDateTo("");
  }, []);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);
  const postDoc = usePostStockDocument();
  const cancelDoc = useCancelStockDocument();
  const submitDoc = useSubmitStockDocumentApproval();
  const approveDoc = useApproveStockDocument();
  const rejectDoc = useRejectStockDocument();
  const [confirmPostId, setConfirmPostId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [confirmSubmitId, setConfirmSubmitId] = useState<number | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<number | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<number | null>(null);
  const pendingDrafts = (data?.data ?? []).filter((d) => d.status === "Draft").length;
  const menungguCount = (data?.data ?? []).filter((d) => d.status === "Menunggu Approval").length;
  const selesaiCount = (data?.data ?? []).filter((d) => d.status === "Selesai").length;
  const dibatalkanCount = (data?.data ?? []).filter((d) => d.status === "Dibatalkan").length;
  const busy =
    postDoc.isPending ||
    cancelDoc.isPending ||
    submitDoc.isPending ||
    approveDoc.isPending ||
    rejectDoc.isPending;

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
      key: "source",
      label: "Sumber",
      className: "w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) =>
        r.source_document_id ? (
          <Pill tone="brand">{r.source_document ?? `SO#${r.source_document_id}`}</Pill>
        ) : (
          <Pill tone="neutral">Manual</Pill>
        ),
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
          <>
            {canCreate && (
              <Button asChild className="rounded-xl">
                <Link to="/persediaan/adjustment/new">
                  <Plus className="h-4 w-4" /> Buat Penyesuaian
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Export Excel diproses")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
      />
      {pendingDrafts > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm font-medium text-warning">
            {pendingDrafts} koreksi ADJ menunggu ditinjau. Buka dokumen untuk memeriksa baris
            selisih, lalu tekan Posting.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Draft</p>
          <p className="text-lg font-bold">{pendingDrafts}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Menunggu Approval</p>
          <p className="text-lg font-bold">{menungguCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Selesai</p>
          <p className="text-lg font-bold">{selesaiCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Dibatalkan</p>
          <p className="text-lg font-bold">{dibatalkanCount}</p>
        </div>
      </div>
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
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
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
              <div className="flex items-center gap-2">
                <p className="text-xs">{formatNumber(r.line_count)} baris</p>
                {r.source_document_id ? (
                  <Pill tone="brand">{r.source_document ?? `SO#${r.source_document_id}`}</Pill>
                ) : (
                  <Pill tone="neutral">Manual</Pill>
                )}
              </div>
            </div>
          )}
        />
      </Panel>

      <StockDocumentSheet
        doc={detail?.data ?? null}
        isLoading={detailLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onPost={canWrite ? () => detail?.data && setConfirmPostId(detail.data.id) : undefined}
        onCancel={canCancel ? () => detail?.data && setConfirmCancelId(detail.data.id) : undefined}
        onSubmit={canWrite ? () => detail?.data && setConfirmSubmitId(detail.data.id) : undefined}
        onApprove={
          canCancel ? () => detail?.data && setConfirmApproveId(detail.data.id) : undefined
        }
        onReject={canCancel ? () => detail?.data && setConfirmRejectId(detail.data.id) : undefined}
        busy={busy}
      />

      <AlertDialog open={confirmPostId != null} onOpenChange={(o) => !o && setConfirmPostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Posting koreksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Memosting akan memindahkan stok sesuai baris selisih ke ledger dan mengubah saldo
              stok. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmPostId == null) return;
                postDoc.mutate(confirmPostId, {
                  onSuccess: () => {
                    toast.success("Koreksi berhasil diposting");
                    setConfirmPostId(null);
                    setSelectedId(null);
                  },
                  onError: (err) =>
                    toast.error(isApiError(err) ? err.message : "Gagal memosting koreksi"),
                });
              }}
            >
              Ya, posting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCancelId != null}
        onOpenChange={(o) => !o && setConfirmCancelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan koreksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen koreksi akan berstatus Dibatalkan dan tidak dapat diposting lagi. Stok tidak
              berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmCancelId == null) return;
                cancelDoc.mutate(confirmCancelId, {
                  onSuccess: () => {
                    toast.success("Koreksi dibatalkan");
                    setConfirmCancelId(null);
                    setSelectedId(null);
                  },
                  onError: (err) =>
                    toast.error(isApiError(err) ? err.message : "Gagal membatalkan koreksi"),
                });
              }}
            >
              Ya, batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmSubmitId != null}
        onOpenChange={(o) => !o && setConfirmSubmitId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajukan untuk approval?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen akan berstatus Menunggu Approval dan menunggu persetujuan Auditor/Kelola
              Persediaan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmSubmitId == null) return;
                submitDoc.mutate(confirmSubmitId, {
                  onSuccess: () => {
                    toast.success("Diajukan untuk approval");
                    setConfirmSubmitId(null);
                    setSelectedId(null);
                  },
                  onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal mengajukan"),
                });
              }}
            >
              Ya, ajukan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmApproveId != null}
        onOpenChange={(o) => !o && setConfirmApproveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui koreksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Menyetujui akan memposting koreksi ke ledger dan mengubah saldo stok. Pastikan sudah
              ditinjau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmApproveId == null) return;
                approveDoc.mutate(
                  { id: confirmApproveId },
                  {
                    onSuccess: () => {
                      toast.success("Koreksi disetujui dan diposting");
                      setConfirmApproveId(null);
                      setSelectedId(null);
                    },
                    onError: (err) =>
                      toast.error(isApiError(err) ? err.message : "Gagal menyetujui"),
                  },
                );
              }}
            >
              Ya, setujui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmRejectId != null}
        onOpenChange={(o) => !o && setConfirmRejectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak koreksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen akan berstatus Dibatalkan dan tidak diposting. Masukkan alasan penolakan jika
              perlu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRejectId == null) return;
                rejectDoc.mutate(
                  { id: confirmRejectId, decision_note: "Ditolak via UI" },
                  {
                    onSuccess: () => {
                      toast.success("Koreksi ditolak");
                      setConfirmRejectId(null);
                      setSelectedId(null);
                    },
                    onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal menolak"),
                  },
                );
              }}
            >
              Ya, tolak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
