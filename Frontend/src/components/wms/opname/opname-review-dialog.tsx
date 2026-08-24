import { useMemo, useState } from "react";
import { CheckCheck, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { usePostStockDocument, useUpdateStockDocument } from "@/hooks/use-persediaan";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import { isApiError } from "@/lib/api";
import { opnameReasonCodes } from "@/lib/persediaan-types";
import type { StockDocumentApi, StockDocumentLineApi } from "@/lib/persediaan-types";

type ReviewEntry = {
  line: StockDocumentLineApi;
  actual: number | null;
  variance: number;
};

// Dialog penutup opname: menampilkan hasil fisik vs sistem (reveal setelah blind
// count), mewajibkan alasan selisih untuk baris dengan variance != 0, lalu
// menyimpan draft (PUT) dan memposting (POST /post) secara berurutan.
export function OpnameReviewDialog({
  open,
  onOpenChange,
  session,
  lines,
  records,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: StockDocumentApi;
  lines: StockDocumentLineApi[];
  records: Record<number, string>;
  onCompleted?: () => void;
}) {
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const update = useUpdateStockDocument();
  const post = usePostStockDocument();

  const [reasons, setReasons] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.reason_code ?? ""])),
  );

  const entries = useMemo<ReviewEntry[]>(
    () =>
      lines.map((l) => {
        const raw = (records[l.id] ?? "").trim();
        const actual = raw === "" ? null : Number(raw);
        return { line: l, actual, variance: (actual ?? 0) - (l.system_qty ?? 0) };
      }),
    [lines, records],
  );

  const uncounted = entries.filter((e) => e.actual == null).length;
  const varianceRows = entries.filter((e) => e.variance !== 0);
  const missing = varianceRows.filter((e) => !reasons[e.line.id]?.trim());
  const totalValue = entries.reduce((acc, e) => acc + e.variance * e.line.unit_cost, 0);
  const busy = update.isPending || post.isPending;

  const confirm = () => {
    if (!canCreate) return;
    if (busy) return;
    if (uncounted > 0) {
      toast.error(`${uncounted} barang belum dihitung — lengkapi semua fisik dulu.`);
      return;
    }
    if (missing.length > 0) {
      toast.error("Alasan selisih wajib dipilih untuk semua baris yang berbeda dari sistem.");
      return;
    }

    update.mutate(
      {
        id: session.id,
        payload: {
          document_date: session.document_date,
          pic: session.pic,
          lines: entries.map((e) => ({
            item_id: e.line.item_id,
            from_bin_id: e.line.from_bin_id ?? null,
            system_qty: e.line.system_qty,
            actual_qty: e.actual,
            unit_cost: e.line.unit_cost,
            reason_code: e.variance === 0 ? null : reasons[e.line.id]?.trim() || null,
          })),
        },
      },
      {
        onSuccess: () =>
          post.mutate(session.id, {
            onSuccess: () => {
              toast.success(
                "Opname selesai — koreksi ADJ dibuat sebagai Draft. Tinjau & posting di Persediaan → Penyesuaian",
              );
              onOpenChange(false);
              onCompleted?.();
            },
            onError: (err) =>
              toast.error(isApiError(err) ? err.message : "Gagal menyelesaikan opname"),
          }),
        onError: (err) =>
          toast.error(isApiError(err) ? err.message : "Gagal menyimpan hasil opname"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>Tinjau Hasil Opname — {session.no}</DialogTitle>
          <DialogDescription>
            {session.warehouse ?? "—"} · {formatNumber(entries.length)} baris ·{" "}
            {varianceRows.length} selisih. Baris yang berbeda dari sistem wajib memilih alasan
            selisih.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {entries.map((e) => {
            const { line } = e;
            const reason = reasons[e.line.id] ?? "";
            return (
              <div
                key={line.id}
                className="grid gap-2.5 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(200px,1fr)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.name ?? "—"}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {line.sku ?? "—"} · Bin {line.from_bin ?? "Lantai"}
                  </p>
                </div>
                <div className="text-xs">
                  <p className="text-muted-foreground">Sistem</p>
                  <b>
                    {formatNumber(line.system_qty ?? 0)} {line.unit ?? ""}
                  </b>
                </div>
                <div className="text-xs">
                  <p className="text-muted-foreground">Fisik</p>
                  <b>{e.actual != null ? `${formatNumber(e.actual)} ${line.unit ?? ""}` : "—"}</b>
                </div>
                <div className="text-xs">
                  <p className="text-muted-foreground">Selisih</p>
                  <Pill tone={e.variance === 0 ? "success" : e.variance > 0 ? "info" : "danger"}>
                    {e.actual == null
                      ? "—"
                      : `${e.variance > 0 ? "+" : ""}${formatNumber(e.variance)} ${line.unit ?? ""}`}
                  </Pill>
                </div>
                <div className="min-w-0">
                  <Select
                    value={reason}
                    onValueChange={(v) => setReasons((prev) => ({ ...prev, [line.id]: v }))}
                  >
                    <SelectTrigger
                      className={`rounded-xl ${e.variance !== 0 && !reason ? "border-destructive/60" : ""}`}
                    >
                      <SelectValue placeholder="Pilih alasan..." />
                    </SelectTrigger>
                    <SelectContent side="top" avoidCollisions={false}>
                      {Object.entries(opnameReasonCodes).map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>

        {uncounted > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" /> {uncounted} barang belum dihitung.
          </p>
        )}

        <DialogFooter className="flex-wrap items-center gap-2">
          <div className="mr-auto text-sm">
            <span className="text-muted-foreground">Total nilai selisih: </span>
            <b
              className={totalValue > 0 ? "text-success" : totalValue < 0 ? "text-destructive" : ""}
            >
              {formatIDR(totalValue)}
            </b>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            <X className="h-4 w-4" /> Batal
          </Button>
          {canCreate && (
            <Button
              className="rounded-xl"
              onClick={confirm}
              disabled={busy || uncounted > 0 || missing.length > 0}
              title={missing.length > 0 ? "Pilih alasan untuk semua baris selisih" : undefined}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              {update.isPending
                ? "Menyimpan..."
                : post.isPending
                  ? "Posting..."
                  : "Selesaikan Opname"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
