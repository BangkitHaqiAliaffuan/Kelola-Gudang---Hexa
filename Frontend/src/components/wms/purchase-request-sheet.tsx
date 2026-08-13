import { useState } from "react";
import { CheckCircle2, Pencil, Printer, Send, Trash2, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  useApproveProcDoc,
  useCancelProcDoc,
  useDeleteProcDoc,
  useRejectProcDoc,
  useSubmitProcDoc,
} from "@/hooks/use-pengadaan";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import type { ProcDocApi, ProcDocStatus } from "@/lib/pengadaan-types";

const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso) : "—");

const statusTone = (s: ProcDocStatus): Tone =>
  s === "Disetujui"
    ? "success"
    : s === "Ditolak"
      ? "danger"
      : s === "Menunggu Approval"
        ? "warning"
        : s === "Dibatalkan"
          ? "danger"
          : "neutral";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** Cetak sungguhan: buka jendela print dengan layout dokumen PR. */
function printProcDoc(doc: ProcDocApi) {
  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) {
    toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
    return;
  }
  const rows = (doc.lines ?? [])
    .map(
      (l) => `
        <tr>
          <td>${l.line_no}</td>
          <td>${l.name ?? "—"}<br/><span style="color:#64748b;font-size:11px">${l.sku ?? ""}</span></td>
          <td style="text-align:right">${formatNumber(l.qty)} ${l.unit ?? ""}</td>
          <td style="text-align:right">${formatIDR(l.price)}</td>
          <td style="text-align:right">${formatIDR(l.subtotal)}</td>
        </tr>`,
    )
    .join("");
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>${doc.no} — Purchase Request</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
  .field{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
  .field b{display:block;font-size:13px}
  .field span{color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .right{text-align:right}
  .total{margin-top:12px;text-align:right;font-weight:700}
  .note{margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px}
  .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
</style></head><body>
<h1>Purchase Request</h1>
<p class="mono muted">${doc.no} · Status: ${doc.status} · Tanggal: ${fmtDate(doc.document_date)}</p>
<div class="grid">
  <div class="field"><span>Departemen</span><b>${doc.department ?? "—"}</b></div>
  <div class="field"><span>Supplier</span><b>${doc.supplier ?? "—"}</b></div>
  <div class="field"><span>Gudang</span><b>${doc.warehouse ?? "—"}</b></div>
  <div class="field"><span>Dibutuhkan</span><b>${fmtDate(doc.need_date)}</b></div>
  <div class="field"><span>Pemohon</span><b>${doc.requester ?? "—"}</b></div>
  <div class="field"><span>Referensi</span><b>${doc.reference ?? "—"}</b></div>
  <div class="field"><span>Disetujui</span><b>${doc.approved_by ?? "—"}</b></div>
  <div class="field"><span>Tanggal Approval</span><b>${fmtDate(doc.approved_at)}</b></div>
</div>
<table>
  <thead><tr><th>No</th><th>Barang</th><th class="right">Qty</th><th class="right">Harga</th><th class="right">Subtotal</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total Nilai: ${formatIDR(doc.value_total ?? 0)}</p>
${doc.note ? `<div class="note"><b>Catatan:</b> ${doc.note}</div>` : ""}
${doc.decision_note ? `<div class="note"><b>Catatan Keputusan:</b> ${doc.decision_note}</div>` : ""}
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

export function PurchaseRequestSheet({
  doc,
  onOpenChange,
}: {
  doc: ProcDocApi | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");
  const canManage = hasModuleLevel("Pengadaan", "Kelola");
  const submit = useSubmitProcDoc();
  const approve = useApproveProcDoc();
  const reject = useRejectProcDoc();
  const cancel = useCancelProcDoc();
  const remove = useDeleteProcDoc();

  const [confirmAction, setConfirmAction] = useState<
    "submit" | "approve" | "cancel" | "delete" | null
  >(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const busy =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    cancel.isPending ||
    remove.isPending;

  const runAction = (action: "submit" | "approve" | "cancel" | "delete") => {
    if (!doc) return;
    setConfirmAction(null);
    const opts = {
      onSuccess: () =>
        toast.success(
          action === "submit"
            ? `PR ${doc.no} dikirim untuk approval`
            : action === "approve"
              ? `PR ${doc.no} disetujui`
              : action === "cancel"
                ? `PR ${doc.no} dibatalkan`
                : `PR ${doc.no} dihapus`,
        ),
      onError: (err: Error) => toast.error(err.message),
    };
    if (action === "submit")
      void submit.mutateAsync(doc.id).then(opts.onSuccess).catch(opts.onError);
    if (action === "approve")
      void approve.mutateAsync(doc.id).then(opts.onSuccess).catch(opts.onError);
    if (action === "cancel")
      void cancel.mutateAsync(doc.id).then(opts.onSuccess).catch(opts.onError);
    if (action === "delete")
      void remove.mutateAsync(doc.id).then(opts.onSuccess).catch(opts.onError);
  };

  const confirmLabel =
    confirmAction === "submit"
      ? "Kirim PR ini untuk approval?"
      : confirmAction === "approve"
        ? "Setujui PR ini?"
        : confirmAction === "cancel"
          ? "Batalkan PR ini?"
          : confirmAction === "delete"
            ? "Hapus PR ini?"
            : "";

  const confirmDesc =
    confirmAction === "submit"
      ? "Dokumen akan berpindah ke status Menunggu Approval dan tidak bisa diedit lagi."
      : confirmAction === "approve"
        ? "PR disetujui dan siap diterbitkan menjadi Purchase Order."
        : confirmAction === "cancel"
          ? "Dokumen akan berstatus Dibatalkan. Tindakan ini tidak dapat dibatalkan."
          : confirmAction === "delete"
            ? "Dokumen draft akan dihapus permanen beserta seluruh barisnya."
            : "";

  if (!doc) return null;

  const isDraft = doc.status === "Draft";
  const isPending = doc.status === "Menunggu Approval";

  return (
    <Sheet open={!!doc} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="font-mono text-base">{doc.no}</SheetTitle>
            <Pill tone={statusTone(doc.status)}>{doc.status}</Pill>
          </div>
          <SheetDescription>
            Purchase Request · {fmtDate(doc.document_date)} · Pemohon {doc.requester ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Departemen" value={doc.department ?? "—"} />
            <Field label="Supplier" value={doc.supplier ?? "—"} />
            <Field label="Gudang" value={doc.warehouse ?? "—"} />
            <Field label="Dibutuhkan" value={fmtDate(doc.need_date)} />
            <Field label="Pemohon" value={doc.requester ?? "—"} />
            <Field label="Referensi" value={doc.reference ?? "—"} />
            <Field label="Diajukan" value={fmtDate(doc.submitted_at)} />
            <Field label="Dibuat oleh" value={doc.created_by ?? "—"} />
            {doc.approved_by && <Field label="Disetujui oleh" value={doc.approved_by ?? "—"} />}
            {doc.approved_at && <Field label="Tanggal Approval" value={fmtDate(doc.approved_at)} />}
          </div>

          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">Daftar Barang</p>
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {["No", "Barang", "Qty", "Harga", "Subtotal"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(doc.lines ?? []).map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.line_no}</td>
                      <td className="max-w-[240px] truncate px-3 py-2">
                        <p className="truncate">{l.name ?? "—"}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {l.sku ?? ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {formatNumber(l.qty)} {l.unit ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {formatIDR(l.price)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        {formatIDR(l.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 p-3 sm:hidden">
              {(doc.lines ?? []).map((l) => (
                <div key={l.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium">{l.name ?? "—"}</p>
                    <b className="whitespace-nowrap">{formatIDR(l.subtotal)}</b>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.sku ?? ""} · {formatNumber(l.qty)} {l.unit ?? ""} @ {formatIDR(l.price)}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Jumlah Baris</span>
              <span className="text-center font-semibold">{(doc.lines ?? []).length}</span>
              <span className="text-right font-semibold">
                {formatNumber(doc.qty_total ?? 0)} unit
              </span>
              <span className="font-medium">Total Nilai</span>
              <span className="col-span-2 text-right text-base font-bold">
                {formatIDR(doc.value_total ?? 0)}
              </span>
            </div>
          </div>

          {doc.note && (
            <div className="rounded-xl border border-border px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Catatan</p>
              <p className="mt-1 text-sm">{doc.note}</p>
            </div>
          )}
          {doc.decision_note && (
            <div className="rounded-xl border border-destructive/40 px-4 py-3">
              <p className="text-xs font-semibold text-destructive">Catatan Keputusan</p>
              <p className="mt-1 text-sm">{doc.decision_note}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <Button variant="outline" className="rounded-xl" onClick={() => printProcDoc(doc)}>
            <Printer className="h-4 w-4" /> Cetak
          </Button>
          {isDraft && canWrite && (
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/pengadaan/purchase-request/edit/$id" params={{ id: String(doc.id) }}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          )}
          {isDraft && canWrite && (
            <Button
              className="rounded-xl"
              onClick={() => setConfirmAction("submit")}
              disabled={busy}
            >
              <Send className="h-4 w-4" /> Kirim
            </Button>
          )}
          {(isDraft || isPending) && canWrite && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setConfirmAction("cancel")}
              disabled={busy}
            >
              <XCircle className="h-4 w-4" /> Batalkan
            </Button>
          )}
          {isPending && canWrite && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setConfirmAction("approve")}
              disabled={busy}
            >
              <CheckCircle2 className="h-4 w-4" /> Setujui
            </Button>
          )}
          {isPending && canWrite && (
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => {
                setRejectReason("");
                setRejectOpen(true);
              }}
              disabled={busy}
            >
              <XCircle className="h-4 w-4" /> Tolak
            </Button>
          )}
          {isDraft && canManage && (
            <Button
              variant="ghost"
              className="rounded-xl text-destructive"
              onClick={() => setConfirmAction("delete")}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" /> Hapus
            </Button>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmLabel}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" onClick={() => setConfirmAction(null)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) runAction(confirmAction);
              }}
            >
              Ya, lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Tolak Purchase Request</DialogTitle>
            <DialogDescription>
              Alasan penolakan wajib diisi dan akan tercatat pada dokumen.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Contoh: anggaran belum tersedia, spesifikasi tidak jelas..."
            rows={3}
            className="rounded-xl"
          />
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={!rejectReason.trim() || busy}
              onClick={async () => {
                if (!doc) return;
                const reason = rejectReason.trim();
                setRejectOpen(false);
                try {
                  const res = await reject.mutateAsync({ id: doc.id, reason });
                  toast.success(`PR ${res.data.no} ditolak`);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              Tolak PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
