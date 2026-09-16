import type { ItemApi } from "./master-types";
import type { StockRowApi } from "./persediaan-types";

export type RekapWarehouse = {
  warehouse_id: number;
  warehouse: string;
  stock: number;
  reserved: number;
  available: number;
  nilai: number;
  /** Pangsa stock gudang ini terhadap total barang (0–100). */
  pct: number;
};

export type RekapRow = {
  /** Sama dengan item_id (syarat `DataTable`: `{ id: string | number }`). */
  id: number;
  item_id: number;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  stock: number;
  reserved: number;
  available: number;
  nilai: number;
  status: StockRowApi["status"];
  /** Rincian per gudang, terurut qty terbesar dulu. */
  warehouses: RekapWarehouse[];
  /** Jumlah baris lokasi (gudang × rak × bin) penyusun total. */
  locationCount: number;
};

const STATUS_RANK: Record<StockRowApi["status"], number> = {
  Habis: 0,
  Normal: 1,
  Overstock: 2,
  Menipis: 3,
};

const RANK_STATUS: StockRowApi["status"][] = ["Habis", "Normal", "Overstock", "Menipis"];

/**
 * Lipat baris stock per lokasi (`GET /api/persediaan/stock`) menjadi satu
 * baris per barang: total + rincian per gudang. Barang master tanpa baris
 * stock ikut tampil dengan angka 0 (status Habis) agar "seluruh barang"
 * benar-benar terlihat tanpa klik satu-satu.
 */
export function foldStockRekap(rows: StockRowApi[], items: ItemApi[]): RekapRow[] {
  const byItem = new Map<number, StockRowApi[]>();
  for (const r of rows) {
    const list = byItem.get(r.item_id);
    if (list) list.push(r);
    else byItem.set(r.item_id, [r]);
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const out: RekapRow[] = [];
  const seen = new Set<number>();

  const build = (itemId: number, locs: StockRowApi[], fallback?: ItemApi): RekapRow => {
    const first = locs[0];
    const stock = locs.reduce((a, r) => a + r.stock, 0);
    const reserved = locs.reduce((a, r) => a + r.reserved, 0);
    const available = locs.reduce((a, r) => a + r.available, 0);
    const nilai = locs.reduce((a, r) => a + r.nilai, 0);

    const perWh = new Map<number, RekapWarehouse>();
    for (const r of locs) {
      const cur = perWh.get(r.warehouse_id);
      if (cur) {
        cur.stock += r.stock;
        cur.reserved += r.reserved;
        cur.available += r.available;
        cur.nilai += r.nilai;
      } else {
        perWh.set(r.warehouse_id, {
          warehouse_id: r.warehouse_id,
          warehouse: r.warehouse ?? "—",
          stock: r.stock,
          reserved: r.reserved,
          available: r.available,
          nilai: r.nilai,
          pct: 0,
        });
      }
    }
    const warehouses: RekapWarehouse[] = [...perWh.values()]
      .map((w) => ({ ...w, pct: stock > 0 ? (w.stock / stock) * 100 : 0 }))
      .sort((a, b) => b.stock - a.stock);

    const worst = locs.reduce((a, r) => Math.max(a, STATUS_RANK[r.status]), 0);
    const status: StockRowApi["status"] =
      locs.length === 0 || stock <= 0 ? "Habis" : RANK_STATUS[worst]!;

    const master = fallback ?? itemById.get(itemId);
    return {
      id: itemId,
      item_id: itemId,
      sku: master?.sku ?? first?.sku ?? "—",
      name: master?.name ?? first?.name ?? "—",
      unit: master?.unit ?? first?.unit ?? "",
      category: master?.category ?? null,
      stock,
      reserved,
      available,
      nilai,
      status,
      warehouses,
      locationCount: locs.length,
    };
  };

  for (const item of items) {
    seen.add(item.id);
    out.push(build(item.id, byItem.get(item.id) ?? [], item));
  }
  // Baris yatim (master terhapus di tengah jalan): tetap tampil dari data lokasi.
  for (const [itemId, locs] of byItem) {
    if (!seen.has(itemId)) out.push(build(itemId, locs));
  }

  return out;
}
