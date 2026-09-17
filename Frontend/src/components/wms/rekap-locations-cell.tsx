import { formatNumber } from "@/lib/wms-data";
import type { RekapRow } from "@/lib/stock-rekap";
import { cn } from "@/lib/utils";

type Props = {
  row: RekapRow;
  /** Id gudang tersorot (dari filter): barisnya tampil tegas, sisanya redup. */
  highlightId?: number | null;
  onWarehouseClick: (warehouseId: number) => void;
};

/**
 * Daftar SELURUH gudang penyimpan barang beserta saldonya — tanpa batas
 * jumlah. Klik baris gudang = drill ke kartu stock gudang itu
 * (stopPropagation agar tidak memicu onRowClick baris = halaman detail).
 */
export function RekapLocationsCell({ row, highlightId, onWarehouseClick }: Props) {
  if (row.warehouses.length === 0) {
    return <span className="text-sm text-muted-foreground">Tidak ada stock</span>;
  }

  return (
    <ul className="min-w-[220px] divide-y divide-border/60">
      {row.warehouses.map((w) => {
        const hl = highlightId == null || w.warehouse_id === highlightId;
        return (
          <li key={w.warehouse_id}>
            <button
              type="button"
              title={`Buka kartu stock ${w.warehouse}`}
              className={cn(
                "flex w-full items-baseline justify-between gap-3 py-1 text-left",
                !hl && "opacity-50",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onWarehouseClick(w.warehouse_id);
              }}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  hl ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {w.warehouse}
              </span>
              <span className="shrink-0 text-sm">
                <b>
                  {formatNumber(w.stock)} {row.unit || "—"}
                </b>{" "}
                <span className="text-xs text-muted-foreground">
                  · tersedia {formatNumber(w.available)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Varian kartu mobile: daftar gudang penuh yang sama, tanpa tooltip
 * (hover tak ada di sentuh).
 */
export function RekapLocationsCompact({ row, highlightId, onWarehouseClick }: Props) {
  if (row.warehouses.length === 0) {
    return <p className="text-xs text-muted-foreground">Tidak ada stock</p>;
  }

  return (
    <ul className="divide-y divide-border/60">
      {row.warehouses.map((w) => {
        const hl = highlightId == null || w.warehouse_id === highlightId;
        return (
          <li key={w.warehouse_id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-xs",
                !hl && "opacity-50",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onWarehouseClick(w.warehouse_id);
              }}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  hl ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {w.warehouse}
              </span>
              <span className="shrink-0">
                <b className="text-foreground">
                  {formatNumber(w.stock)} {row.unit || "—"}
                </b>{" "}
                <span className="text-muted-foreground">
                  · tersedia {formatNumber(w.available)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
