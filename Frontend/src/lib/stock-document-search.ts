import type { StockDocumentApi } from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

const toText = (v: string | number | null | undefined) => (v == null || v === "" ? "" : String(v));

export function buildStockDocumentSearchText(doc: StockDocumentApi): string {
  const values = [
    doc.no,
    doc.type,
    doc.warehouse,
    doc.destination,
    doc.partner,
    doc.customer,
    doc.reference_no,
    doc.source_document,
    doc.pic,
    doc.status,
    doc.note,
    doc.line_count,
    doc.document_date,
    doc.document_date ? formatDate(doc.document_date) : "",
    doc.qty_total,
    formatNumber(doc.qty_total ?? 0),
    doc.value_total,
    formatIDR(doc.value_total ?? 0),
  ];

  return values
    .map(toText)
    .filter((v) => v !== "")
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function stockDocumentMatchesText(doc: StockDocumentApi, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return true;
  return buildStockDocumentSearchText(doc).includes(q);
}
