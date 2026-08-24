import { Ban, CheckCheck, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "./kit";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import { opnameReasonLabel } from "@/lib/persediaan-types";
import type {
  StockDocumentApi,
  StockDocumentLineApi,
  StockDocumentStatus,
} from "@/lib/persediaan-types";

const statusTone = (s: StockDocumentStatus): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function lineQty(line: StockDocumentLineApi): string {
  if (line.system_qty != null && line.actual_qty != null) {
    const variance = line.variance ?? 0;
    const sign = variance > 0 ? "+" : variance < 0 ? "−" : "";
    return `${formatNumber(line.actual_qty)} ${line.unit ?? ""} (${sign}${formatNumber(Math.abs(variance))})`;
  }
  return `${formatNumber(line.qty ?? 0)} ${line.unit ?? ""}`;
}

/**
 * Nilai rupiah satu baris. Baris Stock Opname tidak punya qty tunggal — mutasinya
 * adalah selisih stok fisik vs sistem (variance), konsisten dengan StockDocumentLine::moveQty().
 */
function lineValue(line: StockDocumentLineApi): number {
  return Math.abs(line.variance ?? line.qty ?? 0) * line.unit_cost;
}

function isOpnameLine(line: StockDocumentLineApi): boolean {
  return line.system_qty != null && line.actual_qty != null;
}

function varianceSign(variance: number): string {
  return variance > 0 ? "+" : variance < 0 ? "−" : "";
}

/** Arah pergerakan satu baris: dari movement (posting) atau fallback tanda qty (draft). */
function lineDirection(line: StockDocumentLineApi): "IN" | "OUT" {
  return line.direction ?? ((line.qty ?? 0) < 0 ? "OUT" : "IN");
}

function lineSignedQty(line: StockDocumentLineApi): number {
  const qty = Math.abs(line.qty ?? 0);
  return lineDirection(line) === "IN" ? qty : -qty;
}

function lineLocation(line: StockDocumentLineApi): string {
  const from = [line.from_rack, line.from_bin].filter(Boolean).join(" · ") || "—";
  if (!line.to_bin) return from;
  const to = [line.to_rack, line.to_bin].filter(Boolean).join(" · ") || "—";
  return `${from} → ${to}`;
}

/** Sel Qty tabel: Stock Opname menampilkan colok Sistem/Fisik/Selisih, Stock Adjustment pill arah + qty bertanda. */
function LineQtyCells({
  line,
  mode,
}: {
  line: StockDocumentLineApi;
  mode: "plain" | "opname" | "adjustment";
}) {
  if (mode === "opname") {
    const variance = line.variance ?? 0;
    const tone = variance > 0 ? "text-success" : variance < 0 ? "text-destructive" : "text-success";

    return (
      <>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {formatNumber(line.system_qty ?? 0)} {line.unit ?? ""}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {formatNumber(line.actual_qty ?? 0)} {line.unit ?? ""}
        </td>
        <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${tone}`}>
          {variance === 0
            ? "Netral"
            : `${varianceSign(variance)}${formatNumber(Math.abs(variance))}`}
        </td>
      </>
    );
  }

  if (mode === "adjustment") {
    const inDir = lineDirection(line) === "IN";
    return (
      <>
        <td className="whitespace-nowrap px-3 py-2">
          <Pill tone={inDir ? "success" : "danger"}>
            {inDir ? "Koreksi Naik" : "Koreksi Turun"}
          </Pill>
        </td>
        <td
          className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${inDir ? "text-success" : "text-destructive"}`}
        >
          {inDir ? "+" : "−"}
          {formatNumber(Math.abs(line.qty ?? 0))} {line.unit ?? ""}
        </td>
      </>
    );
  }

  return <td className="whitespace-nowrap px-3 py-2 text-right">{lineQty(line)}</td>;
}

export function StockDocumentSheet({
  doc,
  onOpenChange,
  isLoading = false,
  onPost,
  onCancel,
  busy = false,
}: {
  doc: StockDocumentApi | null;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  onPost?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  busy?: boolean;
}) {
  const { user, hasModuleLevel } = useAuth();
  const canPost = hasModuleLevel("Persediaan", "Tulis");
  const canCancel = hasModuleLevel("Persediaan", "Kelola");
  const isSelf = doc?.requester_user_id != null && user?.id === doc.requester_user_id;
  const isSelfBlocked =
    isSelf && (doc?.type === "Stock Adjustment" || doc?.type === "Stock Opname");
  const lines = doc?.lines ?? [];
  const isOpname = doc?.type === "Stock Opname" || (lines.length > 0 && lines.every(isOpnameLine));
  const isAdjustment = doc?.type === "Stock Adjustment";
  const mode: "plain" | "opname" | "adjustment" = isOpname
    ? "opname"
    : isAdjustment
      ? "adjustment"
      : "plain";

  const upLines = lines.filter((l) => lineDirection(l) === "IN");
  const downLines = lines.filter((l) => lineDirection(l) === "OUT");
  const totalUp = upLines.reduce((s, l) => s + Math.abs(l.qty ?? 0), 0);
  const totalDown = downLines.reduce((s, l) => s + Math.abs(l.qty ?? 0), 0);
  const netValue = lines.reduce((s, l) => s + lineSignedQty(l) * l.unit_cost, 0);
  const unit = lines[0]?.unit ?? "";

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
                {doc.type} · {formatDate(doc.document_date)} · PIC {doc.pic ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Jenis Dokumen" value={doc.type} />
                <Field label="Tanggal" value={formatDate(doc.document_date)} />
                <Field label="Gudang" value={doc.warehouse ?? "—"} />
                {doc.source_document_id != null && (
                  <Field label="Dokumen Sumber" value={doc.source_document ?? "—"} />
                )}
                <Field
                  label={
                    doc.destination
                      ? "Gudang Tujuan"
                      : doc.type === "Retur Pembelian"
                        ? "Supplier"
                        : doc.type === "Retur Penjualan"
                          ? "Customer"
                          : "Partner / Tujuan"
                  }
                  value={doc.destination ?? doc.partner ?? "—"}
                />
                <Field label="Referensi" value={doc.reference_no ?? "—"} />
                <Field label="Dibuat oleh" value={doc.created_by ?? doc.pic ?? "—"} />
              </div>

              <div className="rounded-xl border border-border">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold">Daftar Barang</p>
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        {(mode === "opname"
                          ? [
                              "Barang",
                              "SKU",
                              "Sistem",
                              "Fisik",
                              "Selisih",
                              "Alasan / Pemeriksa",
                              "Lokasi",
                              "Harga",
                              "Subtotal",
                            ]
                          : mode === "adjustment"
                            ? ["Barang", "SKU", "Arah", "Qty", "Lokasi", "Harga", "Subtotal"]
                            : ["Barang", "SKU", "Qty", "Lokasi", "Harga", "Subtotal"]
                        ).map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-3 py-2 text-left font-semibold"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-b border-border/60 last:border-0">
                          <td className="max-w-[240px] truncate px-3 py-2">{l.name ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                            {l.sku ?? "—"}
                          </td>
                          <LineQtyCells line={l} mode={mode} />
                          {mode === "opname" && (
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                              {opnameReasonLabel(l.reason_code)}
                              {l.counted_by ? ` · ${l.counted_by}` : ""}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                            {lineLocation(l)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formatIDR(l.unit_cost)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                            {formatIDR(lineValue(l))}
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
                      <p className="font-mono text-xs text-muted-foreground">{l.sku ?? "—"}</p>
                      <div className="mt-1 flex justify-between text-xs">
                        <span>
                          {mode === "opname"
                            ? `Sistem ${formatNumber(l.system_qty ?? 0)} · Fisik ${formatNumber(l.actual_qty ?? 0)} (${varianceSign(l.variance ?? 0)}${formatNumber(Math.abs(l.variance ?? 0))})`
                            : mode === "adjustment"
                              ? `${lineDirection(l) === "IN" ? "Koreksi Naik" : "Koreksi Turun"} · ${lineDirection(l) === "IN" ? "+" : "−"}${formatNumber(Math.abs(l.qty ?? 0))} ${l.unit ?? ""}`
                              : lineQty(l)}
                        </span>
                        <b>{formatIDR(lineValue(l))}</b>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {lineLocation(l)}
                      </p>
                      {mode === "opname" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Alasan: {opnameReasonLabel(l.reason_code)} · Dicek: {l.counted_by ?? "—"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
                  {mode === "adjustment" ? (
                    <>
                      <span className="font-medium">Baris Naik</span>
                      <span className="text-right font-semibold text-success">
                        {upLines.length}
                      </span>
                      <span className="font-medium">Baris Turun</span>
                      <span className="text-right font-semibold text-destructive">
                        {downLines.length}
                      </span>
                      <span className="font-medium">Total Bertambah</span>
                      <span className="text-right font-semibold text-success">
                        +{formatNumber(totalUp)} {unit}
                      </span>
                      <span className="font-medium">Total Berkurang</span>
                      <span className="text-right font-semibold text-destructive">
                        −{formatNumber(totalDown)} {unit}
                      </span>
                      <span className="font-medium">Nilai Bersih</span>
                      <span
                        className={`text-right text-base font-bold ${netValue >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {formatIDR(netValue)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Jumlah Baris</span>
                      <span className="text-right font-semibold">{lines.length}</span>
                      <span className="font-medium">Total Nilai</span>
                      <span className="text-right text-base font-bold">
                        {formatIDR(lines.reduce((sum, l) => sum + lineValue(l), 0))}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {doc.note && (
                <div className="rounded-xl border border-border px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground">Catatan</p>
                  <p className="mt-1 text-sm">{doc.note}</p>
                </div>
              )}
            </div>

            {isSelfBlocked && doc.status === "Draft" && (
              <div className="border-t border-border bg-destructive/10 px-5 py-2">
                <p className="text-xs font-medium text-destructive">
                  Pembuat dokumen tidak boleh memposting atau membatalkan laporannya sendiri.
                </p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => toast.success("Dokumen dikirim ke printer")}
              >
                <Printer className="h-4 w-4" /> Cetak
              </Button>
              {doc.type === "Stock Adjustment" && doc.status === "Draft" && (
                <>
                  {canCancel && onCancel && (
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={onCancel}
                      disabled={busy || isSelfBlocked}
                      title={isSelfBlocked ? "Pembuat tidak boleh membatalkan sendiri" : undefined}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}{" "}
                      Batalkan
                    </Button>
                  )}
                  {canPost && onPost && (
                    <Button
                      className="rounded-xl"
                      onClick={onPost}
                      disabled={busy || isSelfBlocked}
                      title={isSelfBlocked ? "Pembuat tidak boleh memposting sendiri" : undefined}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCheck className="h-4 w-4" />
                      )}{" "}
                      Posting
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
