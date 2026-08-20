// CSV export helpers. Adds a UTF-8 BOM so Excel opens the file with the
// correct encoding (Excel otherwise misdetects non-ASCII Indonesian text).

function escapeCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Formula-injection guard (OWASP): hanya sel bertipe string yang diawali
  // karakter formula diberi prefiks apostrof. Sel numerik (number) dibiarkan
  // apa adanya agar tetap terbaca sebagai angka di Excel (mis. variance negatif).
  const cell = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function toCsv(
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
): string {
  const headerLine = headers.map((h) => escapeCell(h.label)).join(",");
  const bodyLines = rows.map((row) => headers.map((h) => escapeCell(row[h.key])).join(","));
  return [headerLine, ...bodyLines].join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
