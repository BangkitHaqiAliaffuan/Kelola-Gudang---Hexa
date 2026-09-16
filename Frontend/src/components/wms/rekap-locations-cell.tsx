import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pill } from "./kit";
import { formatNumber } from "@/lib/wms-data";
import type { RekapRow } from "@/lib/stock-rekap";
import { cn } from "@/lib/utils";

/**
 * Intensitas segmen mengikuti peringkat qty (bukan warna per gudang):
 * aman untuk 8 tema pastel + dark mode, tanpa token warna baru.
 */
const SEGMENT_TONE = ["bg-primary", "bg-primary/70", "bg-primary/40", "bg-primary/25"];

/**
 * Sel hybrid "sebaran lokasi": bar distribusi proporsional (lebar tetap
 * apapun jumlah gudang) + label gudang dominan + tooltip per segmen.
 * Klik segmen = drill ke kartu stock gudang itu (stopPropagation agar tidak
 * memicu onRowClick baris = halaman detail barang).
 */
export function RekapLocationsCell({
  row,
  onWarehouseClick,
}: {
  row: RekapRow;
  onWarehouseClick: (warehouseId: number) => void;
}) {
  if (row.warehouses.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const top = row.warehouses[0]!;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-w-[180px] items-center gap-2">
        <div
          className="flex h-2.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${row.warehouses.length} gudang, terbanyak ${top.warehouse}`}
        >
          {row.warehouses.map((w, i) => (
            <Tooltip key={w.warehouse_id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${w.warehouse}: ${formatNumber(w.stock)} (${Math.round(w.pct)}%)`}
                  className={cn(
                    "h-full min-w-[2px] cursor-pointer",
                    SEGMENT_TONE[i % SEGMENT_TONE.length],
                  )}
                  style={{ flexBasis: `${Math.max(w.pct, 0)}%`, flexGrow: w.pct > 0 ? 1 : 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onWarehouseClick(w.warehouse_id);
                  }}
                />
              </TooltipTrigger>
              <TooltipContent className="whitespace-nowrap">
                {w.warehouse}: {formatNumber(w.stock)} ({Math.round(w.pct)}%)
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="truncate text-xs text-muted-foreground" title={top.warehouse}>
          {top.warehouse} {Math.round(top.pct)}%
        </span>
      </div>
    </TooltipProvider>
  );
}

/**
 * Varian ringkas untuk kartu mobile: tanpa bar (hover tak ada di sentuh),
 * daftar datar 3 lokasi teratas + pill status.
 */
export function RekapLocationsCompact({ row }: { row: RekapRow }) {
  if (row.warehouses.length === 0) {
    return <Pill tone="danger">Habis</Pill>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {row.warehouses.slice(0, 3).map((w) => (
        <span
          key={w.warehouse_id}
          className="truncate text-xs text-muted-foreground"
          title={`${w.warehouse}: ${formatNumber(w.stock)}`}
        >
          {w.warehouse} · <b className="text-foreground">{formatNumber(w.stock)}</b>
        </span>
      ))}
      {row.warehouses.length > 3 && (
        <span className="text-xs text-muted-foreground">+{row.warehouses.length - 3} gudang</span>
      )}
    </div>
  );
}
