import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Pencil,
  Printer,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "./kit";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useApproveProcDocPo,
  useCancelProcDocPo,
  useDeleteProcDocPo,
  useRejectProcDocPo,
  useSubmitProcDocPo,
} from "@/hooks/use-purchase-order";
import { useAuth } from "@/hooks/use-auth";
import { isApiError } from "@/lib/api";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import { canDecideProcDoc } from "@/lib/pengadaan-types";
import type { ProcDocApi } from "@/lib/purchase-order-types";

const statusTone = (s: string): Tone =>
  s === "Selesai" || s === "Disetujui"
    ? "success"
    : s === "Ditolak" || s === "Dibatalkan"
      ? "danger"
      : s === "Draft"
        ? "neutral"
        : s === "Sebagian Diterima"
          ? "info"
          : "warning";

const approvalTone = (s: string): Tone =>
  s === "Disetujui"
    ? "success"
    : s === "Ditolak"
      ? "danger"
      : s === "Menunggu"
        ? "warning"
        : "neutral";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

type SheetAction = "submit" | "approve" | "reject" | "cancel" | "delete";

export function PurchaseOrderSheet({
  doc,
  onOpenChange,
  isLoading = false,
}: {
  doc: ProcDocApi | null;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
}) {
  const [action, setAction] = useState<SheetAction | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const { hasModule, hasModuleLevel, user } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");
  const canManage = hasModuleLevel("Pengadaan", "Kelola");
  const canApprove = hasModule("Approval Pengadaan");
  const canReceive = hasModuleLevel("Persediaan", "Tulis");
  const submit = useSubmitProcDocPo();
  const approve = useApproveProcDocPo();
  const reject = useRejectProcDocPo();
  const cancel = useCancelProcDocPo();
  const destroy = useDeleteProcDocPo();

  const busy =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    cancel.isPending ||
    destroy.isPending;

  const isDraft = doc?.status === "Draft";
  const isPendingApproval = doc?.status === "Menunggu Approval";

  const canDecide = (d: ProcDocApi) => canDecideProcDoc(d, user, canApprove, canManage);

  const labels: Record<SheetAction, { title: string; description: string; confirm: string }> = {
    submit: {
      title: "Ajukan Purchase Order?",
      description: "Status akan berubah menjadi Menunggu Approval.",
      confirm: "Ya, Ajukan",
    },
    approve: {
      title: "Setujui Purchase Order?",
      description: "Status akan berubah menjadi Disetujui dan PO siap diproses supplier.",
      confirm: "Ya, Setujui",
    },
    reject: {
      title: "Tolak Purchase Order?",
      description: "Catatan tambahan (opsional) akan tercatat pada dokumen.",
      confirm: "Ya, Tolak",
    },
    cancel: {
      title: "Batalkan Purchase Order?",
      description: "Status akan berubah menjadi Dibatalkan. Tindakan ini tidak dapat dibatalkan.",
      confirm: "Ya, Batalkan",
    },
    delete: {
      title: "Hapus Purchase Order?",
      description: "Dokumen akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.",
      confirm: "Ya, Hapus",
    },
  };

  const run = async (a: SheetAction) => {
    if (!doc) return;
    try {
      switch (a) {
        case "submit":
          await submit.mutateAsync(doc.id);
          toast.success(`${doc.no} diajukan untuk approval`);
          break;
        case "approve":
          await approve.mutateAsync(doc.id);
          toast.success(`${doc.no} disetujui`);
          break;
        case "reject":
          await reject.mutateAsync({ id: doc.id, decision_note: rejectNote.trim() });
          toast.success(`${doc.no} ditolak`);
          break;
        case "cancel":
          await cancel.mutateAsync(doc.id);
          toast.success(`${doc.no} dibatalkan`);
          break;
        case "delete":
          await destroy.mutateAsync(doc.id);
          toast.success(`${doc.no} dihapus`);
          break;
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(isApiError(err) ? (err.message ?? "Gagal") : (err as Error).message);
    } finally {
      setAction(null);
      setRejectNote("");
    }
  };

  const lines = doc?.lines ?? [];
  const totalValue = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  if (isLoading && !doc) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
        >
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="text-base">Memuat detail...</SheetTitle>
            <SheetDescription>Data sedang diambil dari server.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 items-center justify-center gap-2 p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Memuat data...</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={!!doc} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {doc && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{doc.no}</SheetTitle>
                <Pill tone={statusTone(doc.status)}>{doc.status}</Pill>
              </div>
              <SheetDescription>
                Purchase Order · {formatDate(doc.document_date)} · {doc.requester ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Supplier" value={doc.supplier ?? "—"} />
                <Field label="Gudang Tujuan" value={doc.warehouse ?? "—"} />
                <Field label="No. PR" value={doc.reference ?? "—"} />
                <Field label="Departemen" value={doc.department ?? "—"} />
                <Field label="Dibuat oleh" value={doc.created_by ?? "—"} />
                {isPendingApproval && (
                  <Field label="Approver" value={doc.approver ?? "Belum ditugaskan"} />
                )}
                <Field label="Total Nilai" value={formatIDR(doc.value_total ?? 0)} />
              </div>

              <div className="rounded-xl border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Daftar Barang
                </p>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2">Barang</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Satuan</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-border/70">
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{l.name ?? "—"}</p>
                            <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                          </td>
                          <td className="px-3 py-2">{formatNumber(l.qty)}</td>
                          <td className="px-3 py-2">{l.unit ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{formatIDR(l.price)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatIDR(l.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 p-3 sm:hidden">
                  {lines.map((l) => (
                    <div key={l.id} className="rounded-lg border border-border p-2.5">
                      <p className="text-sm font-medium">{l.name ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                      <div className="mt-1 flex justify-between text-xs">
                        <span>
                          {formatNumber(l.qty)} {l.unit ?? ""}
                        </span>
                        <b>{formatIDR(l.subtotal)}</b>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
                  <span className="font-medium">Jumlah Item</span>
                  <span className="text-right font-semibold">
                    {lines.length} · {formatNumber(totalQty)} unit
                  </span>
                  <span className="font-medium">Total Nilai</span>
                  <span className="text-right text-base font-bold">{formatIDR(totalValue)}</span>
                </div>
              </div>

              {(doc.approvals?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-border">
                  <div className="border-b border-border px-4 py-2.5">
                    <p className="text-sm font-semibold">Riwayat Approval</p>
                  </div>
                  <ol className="divide-y divide-border/70">
                    {doc.approvals!.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            Level {a.level} · {a.approver ?? "Belum ditugaskan"}
                          </p>
                          {a.decision_note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {a.decision_note}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Pill tone={approvalTone(a.status)}>{a.status}</Pill>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(a.decided_at ?? "")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {doc.note && (
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Catatan</p>
                  <p className="text-sm text-foreground">{doc.note}</p>
                </div>
              )}

              {doc.decision_note && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-destructive">Keputusan</p>
                  <p className="text-sm text-foreground">{doc.decision_note}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              {canDecide(doc) && (
                <Button
                  variant="default"
                  className="rounded-xl"
                  onClick={() => setAction("approve")}
                  disabled={busy}
                >
                  <CheckCircle2 className="h-4 w-4" /> Setujui
                </Button>
              )}
              {canDecide(doc) && (
                <Button
                  variant="outline"
                  className="rounded-xl text-destructive"
                  onClick={() => setAction("reject")}
                  disabled={busy}
                >
                  <XCircle className="h-4 w-4" /> Tolak
                </Button>
              )}
              {canSubmit(doc) && canWrite && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setAction("submit")}
                  disabled={busy}
                >
                  <Send className="h-4 w-4" /> Ajukan
                </Button>
              )}
              {isDraft && canWrite && (
                <Button asChild variant="outline" className="rounded-xl">
                  <Link to="/pengadaan/purchase-order/edit/$id" params={{ id: String(doc.id) }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
              )}
              {(isDraft || isPendingApproval) && canWrite && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setAction("cancel")}
                  disabled={busy}
                >
                  <Ban className="h-4 w-4" /> Batalkan
                </Button>
              )}
              {isDraft && canManage && (
                <Button
                  variant="ghost"
                  className="rounded-xl text-destructive"
                  onClick={() => setAction("delete")}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" /> Hapus
                </Button>
              )}
              {doc.status === "Disetujui" && canReceive && (
                <Button asChild className="rounded-xl">
                  <Link to="/pengadaan/receive-goods/new" search={{ po: String(doc.id) }}>
                    <PackageCheck className="h-4 w-4" /> Terima Barang
                  </Link>
                </Button>
              )}
              <Button asChild className="rounded-xl">
                <Link to="/pengadaan/purchase-order/print/$id" params={{ id: String(doc.id) }}>
                  <Printer className="h-4 w-4" /> Cetak
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>

      <AlertDialog open={action != null} onOpenChange={(o) => !o && setAction(null)}>
        <AlertDialogContent className="rounded-xl">
          {action && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels[action].title}</AlertDialogTitle>
                <AlertDialogDescription>{labels[action].description}</AlertDialogDescription>
              </AlertDialogHeader>
              {action === "reject" && (
                <>
                  <Label htmlFor="po-reject-note">Catatan Tambahan (Opsional)</Label>
                  <Textarea
                    id="po-reject-note"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Catatan tambahan (opsional)..."
                    className="rounded-xl"
                    rows={3}
                  />
                </>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl" onClick={() => setAction(null)}>
                  Batal
                </AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-xl"
                  onClick={(e) => {
                    e.preventDefault();
                    void run(action);
                  }}
                >
                  {labels[action].confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function canSubmit(doc: ProcDocApi): boolean {
  return doc.status === "Draft";
}
