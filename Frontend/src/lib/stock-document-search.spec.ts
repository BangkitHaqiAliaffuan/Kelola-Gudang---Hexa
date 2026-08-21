import { describe, expect, it } from "vitest";
import { buildStockDocumentSearchText, stockDocumentMatchesText } from "./stock-document-search";
import type { StockDocumentApi } from "./persediaan-types";

const doc: StockDocumentApi = {
  id: 1,
  no: "BM/2026/00123",
  type: "Penerimaan",
  status: "Selesai",
  document_date: "2026-08-12",
  warehouse_id: 2,
  warehouse: "Gudang Jakarta",
  destination_warehouse_id: null,
  destination: null,
  source_document_id: null,
  source_document: null,
  partner: "PT Sumber Jaya",
  reference_no: "PO-00123",
  pic: "Rudi Hartono",
  note: "Barang datang via kurir",
  posted_at: "2026-08-12T10:00:00Z",
  created_by: "Rudi Hartono",
  requester_user_id: 1,
  requester: "Rudi Hartono",
  blind_count: true,
  frozen_at: null,
  line_count: 2,
  qty_total: 13,
  value_total: 19500,
};

describe("stock document search lintas kolom", () => {
  it("mencocokkan setiap kolom dalam satu baris", () => {
    expect(stockDocumentMatchesText(doc, "bm/2026/00123")).toBe(true);
    expect(stockDocumentMatchesText(doc, "sumber jaya")).toBe(true);
    expect(stockDocumentMatchesText(doc, "gudang jakarta")).toBe(true);
    expect(stockDocumentMatchesText(doc, "rudi hartono")).toBe(true);
    expect(stockDocumentMatchesText(doc, "selesai")).toBe(true);
    expect(stockDocumentMatchesText(doc, "po-00123")).toBe(true);
    expect(stockDocumentMatchesText(doc, "kurir")).toBe(true);
  });

  it("mencocokkan tanggal mentah dan tampilan", () => {
    expect(stockDocumentMatchesText(doc, "2026-08-12")).toBe(true);
    expect(stockDocumentMatchesText(doc, "12 Agu 2026")).toBe(true);
    expect(stockDocumentMatchesText(doc, "agu 2026")).toBe(true);
  });

  it("mencocokkan nilai mentah dan berformat id-ID", () => {
    expect(stockDocumentMatchesText(doc, "19500")).toBe(true);
    expect(stockDocumentMatchesText(doc, "19.500")).toBe(true);
    expect(stockDocumentMatchesText(doc, "Rp 19.500")).toBe(true);
    expect(stockDocumentMatchesText(doc, "  RP   19.500  ")).toBe(true);
    expect(stockDocumentMatchesText(doc, "13")).toBe(true);
  });

  it("case-insensitive, trim, dan spasi ganda", () => {
    expect(stockDocumentMatchesText(doc, "  RUDI   HARTONO  ")).toBe(true);
  });

  it("mencocokkan gudang tujuan (field destination)", () => {
    const transfer = {
      ...doc,
      type: "Transfer Gudang",
      no: "TF/2026/00001",
      warehouse: "Gudang Jakarta",
      destination: "Gudang Surabaya",
      destination_warehouse_id: 3,
      partner: null,
    } satisfies StockDocumentApi;

    expect(stockDocumentMatchesText(transfer, "gudang surabaya")).toBe(true);
    expect(stockDocumentMatchesText(transfer, "gudang jakarta")).toBe(true);
    expect(buildStockDocumentSearchText(transfer)).toContain("gudang surabaya");
  });

  it("query kosong cocok untuk semua", () => {
    expect(stockDocumentMatchesText(doc, "")).toBe(true);
    expect(stockDocumentMatchesText(doc, "   ")).toBe(true);
  });

  it("tidak mencocokkan teks yang tidak ada", () => {
    expect(stockDocumentMatchesText(doc, "gudang surabaya")).toBe(false);
    expect(stockDocumentMatchesText(doc, "xyz-999")).toBe(false);
  });

  it("search text berisi semua kolom tanpa spasi ganda", () => {
    const text = buildStockDocumentSearchText(doc);
    expect(text).toContain("bm/2026/00123");
    expect(text).toContain("12 agu 2026");
    expect(text).toContain("19.500");
    expect(text).toContain("gudang jakarta");
  });
});
