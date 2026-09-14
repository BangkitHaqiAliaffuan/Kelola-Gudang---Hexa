import { buildPrintDoc, escPrintText } from "@/lib/print-doc";
import type { ProcDocApi } from "@/lib/purchase-order-types";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso) : "—");
const txt = (v: string | null | undefined) => escPrintText(v);

/**
 * Dokumen HTML mandiri untuk cetak Purchase Order.
 * Dicetak lewat iframe tersembunyi (`printHtml`) — bukan `window.print()` pada
 * halaman utama — sehingga chrome AppShell (sidebar/header/bottom-nav) tidak
 * pernah masuk ke preview/print. Pola yang sama dipakai PR, stock docs, dan
 * laporan (window.open) serta barcode (iframe).
 */
export function buildPoPrintHtml(doc: ProcDocApi, kopHtml: string): string {
  const lines = doc.lines ?? [];
  const rows = lines
    .map(
      (l) => `
        <tr>
          <td class="mono">${l.line_no}</td>
          <td>${txt(l.name)}<br/><span style="color:#64748b;font-size:11px">${txt(l.sku)}</span></td>
          <td style="text-align:right">${formatNumber(l.qty)}</td>
          <td>${txt(l.unit)}</td>
          <td style="text-align:right">${formatIDR(l.price)}</td>
          <td style="text-align:right">${formatIDR(l.subtotal)}</td>
        </tr>`,
    )
    .join("");
  const totalValue = doc.value_total ?? lines.reduce((sum, l) => sum + l.subtotal, 0);
  const approvals = (doc.approvals ?? [])
    .map(
      (a) =>
        `<div class="field"><span>Approval L${a.level} — ${txt(a.approver)}</span><b>${txt(a.status)}${a.decided_at ? ` · ${fmtDate(a.decided_at)}` : ""}</b></div>`,
    )
    .join("");
  return buildPrintDoc({
    title: `${doc.no} — Purchase Order`,
    kopHtml,
    bodyHtml: `<h1>Purchase Order</h1>
<p class="mono muted">${txt(doc.no)} · Status: ${txt(doc.status)} · Tanggal: ${fmtDate(doc.document_date)}</p>
<div class="grid">
  <div class="field"><span>Supplier</span><b>${txt(doc.supplier)}</b></div>
  <div class="field"><span>Gudang Tujuan</span><b>${txt(doc.warehouse)}</b></div>
  <div class="field"><span>No. PR</span><b>${txt(doc.reference)}</b></div>
  <div class="field"><span>Departemen</span><b>${txt(doc.department)}</b></div>
  <div class="field"><span>Requester</span><b>${txt(doc.requester)}</b></div>
  <div class="field"><span>Dibuat oleh</span><b>${txt(doc.created_by)}</b></div>
  <div class="field"><span>Disetujui</span><b>${txt(doc.approved_by)}</b></div>
  <div class="field"><span>Tanggal Approval</span><b>${fmtDate(doc.approved_at)}</b></div>
</div>
${approvals ? `<div class="grid">${approvals}</div>` : ""}
<table>
  <thead><tr><th>No</th><th>Barang</th><th style="text-align:right">Qty</th><th>Satuan</th><th style="text-align:right">Harga</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total Qty: ${formatNumber(doc.qty_total ?? 0)} · Total Nilai: ${formatIDR(totalValue)}</p>
${doc.note ? `<div class="note"><b>Catatan:</b> ${txt(doc.note)}</div>` : ""}
${doc.decision_note ? `<div class="note"><b>Catatan Keputusan:</b> ${txt(doc.decision_note)}</div>` : ""}
<div class="sign">
  <div>Disetujui oleh<div class="line">Tanda tangan</div></div>
  <div>Dibuat oleh<div class="line">Tanda tangan</div></div>
  <div>Supplier<div class="line">Tanda tangan</div></div>
</div>`,
  });
}
