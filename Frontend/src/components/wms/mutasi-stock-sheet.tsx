import { Pill, type Tone } from "./kit";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useStockCard } from "@/hooks/use-persediaan";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import { Skeleton } from "@/components/ui/skeleton";
import type { LaporanMutasiRowApi } from "@/lib/persediaan-types";

function stockStatus(saldo: number, min: number, max: number | null): string {
  if (saldo <= 0) return "Habis";
  if (max != null) {
    if (saldo <= min) return "Kritis";
    if (saldo <= max) return "Menipis";
  }
  return "Normal";
}

const statusTone = (s: string): Tone =>
  s === "Habis" || s === "Kritis" ? "danger" : s === "Menipis" ? "warning" : "success";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function MutasiStockSheet({
  item,
  periodLabel,
  onOpenChange,
}: {
  item: LaporanMutasiRowApi | null;
  periodLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: card, isLoading } = useStockCard(item?.item_id, "FIFO");
  const rows = card?.data.rows ?? [];

  const status = item ? stockStatus(item.saldo_akhir, item.min_stock, item.max_stock) : "Normal";

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {item && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base">{item.name ?? "—"}</SheetTitle>
                <Pill tone={statusTone(status)}>{status}</Pill>
              </div>
              <SheetDescription>
                {item.sku ?? "—"} · {item.category ?? "Tanpa kategori"} · {item.unit ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Field
                  label="Saldo Awal"
                  value={`${formatNumber(item.saldo_awal)} ${item.unit ?? ""}`}
                />
                <Field
                  label="Masuk"
                  value={`+${formatNumber(item.masuk)} ${item.unit ?? ""}`}
                />
                <Field
                  label="Keluar"
                  value={`-${formatNumber(item.keluar)} ${item.unit ?? ""}`}
                />
                <Field
                  label="Saldo Akhir"
                  value={`${formatNumber(item.saldo_akhir)} ${item.unit ?? ""}`}
                />
                <Field label="HPP Satuan" value={formatIDR(item.unit_cost_avg)} />
                <Field label="Nilai Akhir" value={formatIDR(item.nilai_akhir)} />
                <Field label="Minimum" value={formatNumber(item.min_stock)} />
                <Field
                  label="Maksimum"
                  value={item.max_stock != null ? formatNumber(item.max_stock) : "—"}
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Kartu Stock (FIFO) — {periodLabel}
                  </h3>
                  {!isLoading && card && (
                    <span className="text-xs text-muted-foreground">
                      Saldo akhir{" "}
                      <b className="text-foreground">{formatNumber(card.data.saldo_akhir)}</b>
                    </span>
                  )}
                </div>
                <div className="mt-2 rounded-xl border border-border">
                  {isLoading ? (
                    <div className="space-y-2 p-3">
                      {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-7 rounded-lg" />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">Belum ada mutasi.</p>
                  ) : (
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[380px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            {["Tanggal", "Dokumen", "Masuk", "Keluar", "Saldo"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-semibold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows
                            .slice(-10)
                            .reverse()
                            .map((r, i) => (
                              <tr key={i} className="border-b border-border/60 last:border-0">
                                <td className="px-3 py-1.5 text-xs">{formatDate(r.date)}</td>
                                <td className="px-3 py-1.5 font-mono text-xs">{r.no}</td>
                                <td className="px-3 py-1.5 text-right text-emerald-600">
                                  {r.masuk ? formatNumber(r.masuk) : ""}
                                </td>
                                <td className="px-3 py-1.5 text-right text-rose-500">
                                  {r.keluar ? formatNumber(r.keluar) : ""}
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold">
                                  {formatNumber(r.saldo)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
