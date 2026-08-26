import { Link } from "@tanstack/react-router";
import { Pencil, Printer } from "lucide-react";
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
import { formatDate, formatIDR, formatNumber, type Trx } from "@/lib/wms-data";

const statusTone = (s: Trx["status"]): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

const sectionOf = (t: Trx["type"]) =>
  t === "Barang Masuk"
    ? "masuk"
    : t === "Barang Keluar"
      ? "keluar"
      : t === "Transfer Gudang"
        ? "transfer"
        : t === "Retur Pembelian"
          ? "retur-pembelian"
          : "retur-penjualan";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function TrxDetailSheet({
  trx,
  onOpenChange,
  editable = true,
}: {
  trx: Trx | null;
  onOpenChange: (open: boolean) => void;
  editable?: boolean;
}) {
  const steps = ["Dibuat", "Diverifikasi", "Diproses", "Selesai"];
  const activeStep =
    trx?.status === "Selesai"
      ? 4
      : trx?.status === "Draft"
        ? 1
        : trx?.status === "Dibatalkan"
          ? 1
          : 3;

  return (
    <Sheet open={!!trx} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {trx && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{trx.no}</SheetTitle>
                <Pill tone={statusTone(trx.status)}>{trx.status}</Pill>
              </div>
              <SheetDescription>
                {trx.type} · {formatDate(trx.date)} · PIC {trx.pic}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Jenis Transaksi" value={trx.type} />
                <Field label="Tanggal" value={formatDate(trx.date)} />
                <Field label="Gudang" value={trx.warehouse} />
                <Field
                  label={trx.destination ? "Gudang Tujuan" : "Partner / Tujuan"}
                  value={trx.destination ?? trx.partner}
                />
                <Field label="Referensi" value={trx.reference} />
                <Field label="PIC" value={trx.pic} />
              </div>

              <div className="rounded-xl border border-border">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold">Daftar Barang</p>
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        {["Barang", "SKU", "Qty", "Unit", "Harga", "Subtotal"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trx.lines.map((l, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">{l.name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(l.qty)}</td>
                          <td className="px-3 py-2">{l.unit}</td>
                          <td className="px-3 py-2 text-right">{formatIDR(l.price)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatIDR(l.qty * l.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 p-3 sm:hidden">
                  {trx.lines.map((l, i) => (
                    <div key={i} className="rounded-lg border border-border p-2.5">
                      <p className="text-sm font-medium">{l.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                      <div className="mt-1 flex justify-between text-xs">
                        <span>
                          {formatNumber(l.qty)} {l.unit} × {formatIDR(l.price)}
                        </span>
                        <b>{formatIDR(l.qty * l.price)}</b>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
                  <span className="font-medium">Total Qty</span>
                  <span className="text-right font-semibold">{formatNumber(trx.qty)}</span>
                  <span className="font-medium">Total Nilai</span>
                  <span className="text-right text-base font-bold">{formatIDR(trx.value)}</span>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Timeline Status</p>
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li
                      key={s}
                      className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                          i < activeStep
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-sm">{s}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {i < activeStep ? formatDate(trx.date) : "Menunggu"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => toast.success("Dokumen dikirim ke printer")}
              >
                <Printer className="h-4 w-4" /> Cetak
              </Button>
              {editable && (
                <Button asChild className="rounded-xl">
                  <Link
                    to="/transaksi/entri/$section/$id"
                    params={{ section: sectionOf(trx.type), id: trx.id }}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
