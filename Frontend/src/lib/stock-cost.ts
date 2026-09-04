import type { StockRowApi } from "./persediaan-types";

export const stockCostKey = (
  warehouseId: number | string,
  itemId: number | string,
  binId: number | string | null,
): string => `${warehouseId}:${itemId}:${binId === null || binId === "" ? "NULL" : binId}`;

/**
 * HPP berjalan per (gudang, barang, bin) dari baris GET /api/persediaan/stock
 * (`unit_cost_avg` ledger). Kunci identik dengan pemetaan ketersediaan di
 * form Barang Keluar; stok lantai memakai bin "NULL".
 */
export function buildStockCostMap(rows: StockRowApi[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(stockCostKey(r.warehouse_id, r.item_id, r.bin_id), r.unit_cost_avg);
  }
  return map;
}

/**
 * Rata-rata berjalan untuk satu baris form. `binId` kosong ("") berarti stok
 * lantai. Null bila tidak ada histori (pemanggil fallback ke Harga Pokok master).
 */
export function lookupBinCost(
  map: Map<string, number>,
  warehouseId: string,
  itemId: string,
  binId: string,
): number | null {
  if (!warehouseId || !itemId) return null;
  const v = map.get(stockCostKey(warehouseId, itemId, binId === "" ? null : binId));
  return v ?? null;
}
