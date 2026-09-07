export function nextSku(codes: string[]): string {
  let bestSeries = 10000;
  let bestSeq = 0;
  for (const c of codes) {
    const m = /^SKU-(\d+)-(\d{3})$/.exec(c);
    if (!m) continue;
    const series = Number(m[1]);
    const seq = Number(m[2]);
    if (series > bestSeries || (series === bestSeries && seq > bestSeq)) {
      bestSeries = series;
      bestSeq = seq;
    }
  }
  if (bestSeries === 10000 && bestSeq === 0) return "SKU-10001-001";
  if (bestSeq >= 999) return `SKU-${bestSeries + 1}-001`;
  return `SKU-${bestSeries}-${String(bestSeq + 1).padStart(3, "0")}`;
}
