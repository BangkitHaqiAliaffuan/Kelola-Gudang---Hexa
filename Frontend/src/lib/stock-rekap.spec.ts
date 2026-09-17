import { describe, expect, it } from "vitest";
import type { ItemApi } from "./master-types";
import type { StockRowApi } from "./persediaan-types";
import { foldStockRekap } from "./stock-rekap";

function row(partial: Partial<StockRowApi> & { item_id: number }): StockRowApi {
  return {
    id: `${partial.item_id}-${partial.warehouse_id ?? 0}`,
    sku: "SKU-1",
    name: "Barang 1",
    unit: "pcs",
    category_id: null,
    category: null,
    min: null,
    max: null,
    cost: 1000,
    warehouse_id: 1,
    warehouse: "Gudang A",
    rack: null,
    bin: null,
    bin_id: null,
    stock: 0,
    reserved: 0,
    available: 0,
    unit_cost_avg: 1000,
    nilai: 0,
    status: "Normal",
    ...partial,
  };
}

function item(partial: Partial<ItemApi> & { id: number }): ItemApi {
  return {
    sku: "SKU-1",
    barcode: null,
    internal_barcode: null,
    name: "Barang 1",
    category: "Elektronik",
    category_id: 1,
    subCategory: null,
    sub_category_id: null,
    brand_id: null,
    unit_id: null,
    default_warehouse_id: null,
    default_rack_id: null,
    default_bin_id: null,
    preferred_supplier_id: null,
    brand: null,
    supplier: null,
    warehouse: null,
    rack: null,
    bin: null,
    unit: "pcs",
    stock: 0,
    reserved: 0,
    cost: 1000,
    price: 1500,
    min: 0,
    max: null,
    weight: null,
    dimension: null,
    leadTime: 0,
    status: "Aktif",
    image_url: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("foldStockRekap", () => {
  it("melipat beberapa lokasi menjadi satu baris per barang", () => {
    const rows = [
      row({
        item_id: 1,
        warehouse_id: 1,
        warehouse: "Gudang A",
        stock: 80,
        reserved: 10,
        available: 70,
        nilai: 80000,
        status: "Normal",
      }),
      row({
        item_id: 1,
        warehouse_id: 2,
        warehouse: "Gudang B",
        stock: 20,
        reserved: 0,
        available: 20,
        nilai: 20000,
        status: "Menipis",
      }),
    ];

    const [r] = foldStockRekap(rows, [item({ id: 1 })]);

    expect(r!.stock).toBe(100);
    expect(r!.available).toBe(90);
    expect(r!.nilai).toBe(100000);
    expect(r!.locationCount).toBe(2);
    expect(r!.warehouses.map((w) => w.warehouse)).toEqual(["Gudang A", "Gudang B"]);
    expect(r!.warehouses[0]!.stock).toBe(80);
  });

  it("barang master tanpa stock tampil 0 tanpa rincian gudang", () => {
    const [r] = foldStockRekap([], [item({ id: 9, name: "Kosong", sku: "EMPTY" })]);

    expect(r!.stock).toBe(0);
    expect(r!.warehouses).toEqual([]);
    expect(r!.name).toBe("Kosong");
  });

  it("total nol dari lokasi berpenghuni tetap tampil dengan stock 0", () => {
    const rows = [row({ item_id: 1, stock: 0, status: "Habis" })];
    const [r] = foldStockRekap(rows, [item({ id: 1 })]);

    expect(r!.stock).toBe(0);
  });
});
