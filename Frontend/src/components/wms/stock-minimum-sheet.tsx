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
import type { StockMinimumApi, StockMinimumStatus } from "@/lib/persediaan-types";

const statusTone = (s: StockMinimumStatus): Tone =>
  s === "Habis" ? "danger" : s === "Kritis" ? "danger" : s === "Menipis" ? "warning" : "success";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function StockMinimumSheet({
  item,
  onOpenChange,
}: {
  item: StockMinimumApi | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: card, isLoading } = useStockCard(item?.item_id, "FIFO");
  const rows = card?.data.rows ?? [];

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
                <Pill tone={statusTone(item.status)}>{item.status}</Pill>
              </div>
              <SheetDescription>
                {item.sku ?? "—"} · {item.category ?? "Tanpa kategori"} · {item.unit ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Field
                  label="Stok Total"
                  value={`${formatNumber(item.total_stock)} ${item.unit ?? ""}`}
                />
                <Field
                  label="Tersedia"
                  value={`${formatNumber(item.available)} ${item.unit ?? ""}`}
                />
                <Field
                  label="Reserved"
                  value={`${formatNumber(item.reserved)} ${item.unit ?? ""}`}
                />
                <Field label="Minimum" value={formatNumber(item.min)} />
                <Field label="Maksimum" value={item.max != null ? formatNumber(item.max) : "—"} />
                <Field label="Lead Time" value={`${item.lead_time} hari`} />
                <Field label="Pemakaian/ Hari" value={formatNumber(item.avg_daily_usage)} />
                <Field
                  label="Hari Sisa"
                  value={
                    item.days_of_cover != null ? `${formatNumber(item.days_of_cover)} hari` : "—"
                  }
                />
                <Field label="Supplier" value={item.supplier ?? "—"} />
                <Field label="Harga Satuan" value={formatIDR(item.cost)} />
                <Field label="Nilai Kebutuhan" value={formatIDR(item.suggested_qty * item.cost)} />
              </div>

              <div className="rounded-xl border border-border bg-primary-soft/40 px-4 py-3">
                <p className="text-xs font-semibold text-primary">Usulan Restock</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {formatNumber(item.suggested_qty)} {item.unit ?? ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.max != null
                    ? `Maksimum − Tersedia = ${formatNumber(item.max)} − ${formatNumber(item.available)}`
                    : `(Pemakaian × Lead time) + Minimum − Tersedia`}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Kartu Stock (FIFO)</h3>
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
                            .slice(-8)
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
