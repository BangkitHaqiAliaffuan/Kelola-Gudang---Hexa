import { toast } from "sonner";

/**
 * Helper bersama seluruh fungsi cetak dokumen (PO, PR, stock docs, kartu
 * stock, laporan, opname, barcode-detail).
 *
 * Prinsip: dokumen cetak SELALU terisolasi dari chrome AppShell
 * (sidebar/header/bottom-nav) — via `openPrintWindow` (window baru, dipicu
 * dari klik agar lolos popup-blocker) atau `printHtml` iframe tersembunyi
 * (untuk auto-print saat halaman dibuka). Jangan pernah `window.print()`
 * pada dokumen utama.
 */

/** Escape teks untuk interpolasi aman ke dokumen HTML cetak. */
export function escPrintText(v: string | null | undefined): string {
  return (v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CSS bersama semua dokumen cetak (superset kelas yang dipakai builder). */
export function printDocCss(): string {
  return `body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  .kop-logo{max-height:48px;width:auto;margin-bottom:6px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
  .field{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
  .field b{display:block;font-size:13px}
  .field span{color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .right{text-align:right}
  .total{margin-top:12px;text-align:right;font-weight:700}
  .note{margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px}
  .sign{margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;font-size:12px;color:#64748b}
  .sign .line{margin-top:48px;border-top:1px solid #0f172a;padding-top:4px}
  .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}`;
}

/** Bangun dokumen HTML cetak mandiri (siap tulis ke window/iframe baru). */
export function buildPrintDoc(opts: {
  title: string;
  kopHtml: string;
  bodyHtml: string;
  /** CSS tambahan khusus dokumen (ditambah setelah CSS bersama). */
  extraCss?: string;
}): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>${escPrintText(opts.title)}</title>
<style>
  ${printDocCss()}${opts.extraCss ? `\n  ${opts.extraCss}` : ""}
</style></head><body>
${opts.kopHtml}
${opts.bodyHtml}
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`;
}

/**
 * Buka dokumen HTML di window baru lalu print. Wajib dipanggil dari
 * user-gesture (klik) agar tidak diblokir popup-blocker.
 */
export function openPrintWindow(docHtml: string): void {
  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) {
    toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
    return;
  }
  win.document.write(docHtml);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 150);
}
