import { describe, expect, it } from "vitest";
import { buildPoPrintHtml } from "./purchase-order-print";
import type { ProcDocApi } from "./purchase-order-types";

const doc: ProcDocApi = {
  id: 1,
  no: "PO/2026/0001",
  kind: "PO",
  status: "Disetujui",
  date: "2026-09-01",
  document_date: "2026-09-01",
  requester_user_id: null,
  requester: "Rudi Hartono",
  approver_user_id: null,
  approver: "Siti Aminah",
  department_id: null,
  department: "Gudang",
  supplier_id: 2,
  supplier: "PT Maju",
  warehouse_id: 1,
  warehouse: "Gudang Utama",
  reference: "PR/2026/0007",
  source_proc_doc_id: null,
  source_proc_doc: null,
  note: "Kirim <cepat> & rapi",
  submitted_at: null,
  approved_by: "Siti Aminah",
  approved_at: "2026-09-02",
  decision_note: null,
  approvals: [],
  created_by: "Rudi Hartono",
  line_count: 1,
  qty_total: 10,
  value_total: 50000,
  lines: [
    {
      id: 11,
      proc_doc_id: 1,
      line_no: 1,
      item_id: 5,
      sku: "BRG-001",
      name: "Kardus <L>",
      unit_id: null,
      unit: "pcs",
      qty: 10,
      price: 5000,
      subtotal: 50000,
    },
  ],
};

describe("buildPoPrintHtml", () => {
  it("memuat field dokumen dan kop tanpa chrome aplikasi", () => {
    const html = buildPoPrintHtml(doc, "<p>kop</p>");
    expect(html).toContain("PO/2026/0001");
    expect(html).toContain("PT Maju");
    expect(html).toContain("PR/2026/0007");
    expect(html).toContain("<p>kop</p>");
    expect(html).toContain("Rp 50.000");
    // Chrome AppShell tidak boleh masuk dokumen cetak.
    expect(html).not.toMatch(/<aside|<header|<nav|sidebar|bottom-nav/i);
  });

  it("meng-escape input teks agar tidak merusak markup", () => {
    const html = buildPoPrintHtml(doc, "");
    expect(html).toContain("Kirim &lt;cepat&gt; &amp; rapi");
    expect(html).toContain("Kardus &lt;L&gt;");
    expect(html).not.toContain("Kirim <cepat>");
  });
});
