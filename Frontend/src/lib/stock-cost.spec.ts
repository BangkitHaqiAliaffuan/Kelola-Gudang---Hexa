import { describe, expect, it } from "vitest";

import { buildStockCostMap, lookupBinCost, stockCostKey } from "./stock-cost";
import type { StockRowApi } from "./persediaan-types";

const row = (over: Partial<StockRowApi>): StockRowApi => ({
  id: "x",
  item_id: 1,
  sku: "SKU-1",
  name: "Barang",
  unit: "pcs",
  min: null,
  max: null,
  cost: 100,
  warehouse_id: 1,
  warehouse: "Gudang",
  rack: null,
  bin: null,
  bin_id: 5,
  stock: 10,
  reserved: 0,
  available: 10,
  unit_cost_avg: 150,
  nilai: 1500,
  status: "Normal",
  ...over,
});

describe("stock-cost", () => {
  it("memetakan avg per gudang-barang-bin", () => {
    const map = buildStockCostMap([row({}), row({ bin_id: 6, unit_cost_avg: 200 })]);
    expect(map.get(stockCostKey(1, 1, 5))).toBe(150);
    expect(map.get(stockCostKey(1, 1, 6))).toBe(200);
  });

  it("lookup bin terisi dan stok lantai (bin kosong)", () => {
    const map = buildStockCostMap([row({}), row({ bin_id: null, unit_cost_avg: 120 })]);
    expect(lookupBinCost(map, "1", "1", "5")).toBe(150);
    expect(lookupBinCost(map, "1", "1", "")).toBe(120);
  });

  it("null bila tanpa histori / tanpa gudang / tanpa barang", () => {
    const map = buildStockCostMap([row({})]);
    expect(lookupBinCost(map, "1", "1", "9")).toBeNull();
    expect(lookupBinCost(map, "", "1", "5")).toBeNull();
    expect(lookupBinCost(map, "1", "", "5")).toBeNull();
  });

  it("bin berbeda gudang tidak tercampur", () => {
    const map = buildStockCostMap([row({ warehouse_id: 2, bin_id: 5, unit_cost_avg: 300 })]);
    expect(lookupBinCost(map, "1", "1", "5")).toBeNull();
    expect(lookupBinCost(map, "2", "1", "5")).toBe(300);
  });
});
