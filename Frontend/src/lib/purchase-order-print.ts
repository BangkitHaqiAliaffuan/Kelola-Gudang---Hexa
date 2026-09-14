import { escHtml } from "@/hooks/use-settings";
import type { ProcDocApi } from "@/lib/purchase-order-types";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso) : "—");
const txt = (v: string | null | undefined) => escHtml(v ?? "—");

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
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>${txt(doc.no)} — Purchase Order</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  .kop-logo{max-height:48px;width:auto;margin-bottom:6px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
  .field{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
  .field b{display:block;font-size:13px}
  .field span{color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .total{margin-top:12px;text-align:right;font-weight:700}
  .note{margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px}
  .sign{margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;font-size:12px;color:#64748b}
  .sign .line{margin-top:48px;border-top:1px solid #0f172a;padding-top:4px}
  .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
</style></head><body>
<h1>Purchase Order</h1>
${kopHtml}
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
</div>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`;
}
