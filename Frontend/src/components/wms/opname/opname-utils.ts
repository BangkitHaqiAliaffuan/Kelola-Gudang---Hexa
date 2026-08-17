import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StockDocumentApi, StockDocumentLineApi } from "@/lib/persediaan-types";

export { opnameReasonCodes, opnameReasonLabel } from "@/lib/persediaan-types";

// Label UI alur opname: Draft tanpa hitung fisik = "Dijadwalkan"; Draft yang
// sudah mulai dicatat = "Berjalan"; status backend lainnya ditampilkan apa adanya.
export function opnameLabel(session: Pick<StockDocumentApi, "status" | "checked_count">): string {
  if (session.status === "Draft") {
    return (session.checked_count ?? 0) > 0 ? "Berjalan" : "Dijadwalkan";
  }
  return session.status;
}

export function opnameLabelTone(
  label: string,
): "success" | "warning" | "info" | "danger" | "neutral" {
  switch (label) {
    case "Selesai":
      return "success";
    case "Berjalan":
      return "warning";
    case "Dijadwalkan":
    case "Menunggu Approval":
      return "info";
    case "Dibatalkan":
      return "danger";
    default:
      return "neutral";
  }
}

export function opnameProgress(
  session: Pick<StockDocumentApi, "line_count" | "checked_count">,
): number {
  if (!session.line_count) {
    return 0;
  }
  return Math.min(100, Math.round(((session.checked_count ?? 0) / session.line_count) * 100));
}

export function opnameLineValue(line: StockDocumentLineApi): number {
  return (line.variance ?? 0) * line.unit_cost;
}

export type OpnameSessionSummary = {
  checked: number;
  uncounted: number;
  plus: number;
  minus: number;
  value: number;
};

export function opnameSessionSummary(lines: StockDocumentLineApi[]): OpnameSessionSummary {
  return lines.reduce<OpnameSessionSummary>(
    (acc, line) => {
      const variance = line.variance ?? 0;
      const counted = line.actual_qty != null;
      return {
        checked: acc.checked + (counted ? 1 : 0),
        uncounted: acc.uncounted + (counted ? 0 : 1),
        plus: acc.plus + (counted && variance > 0 ? 1 : 0),
        minus: acc.minus + (counted && variance < 0 ? 1 : 0),
        value: acc.value + opnameLineValue(line),
      };
    },
    { checked: 0, uncounted: 0, plus: 0, minus: 0, value: 0 },
  );
}

export type OpnameAnalytics = {
  sessions: StockDocumentApi[];
  running: number;
  unchecked: number;
  checked: number;
  selisih: number;
  detailById: (id: number) => StockDocumentApi | undefined;
  linesOf: (session: StockDocumentApi) => StockDocumentLineApi[];
};

// Mengambil detail tiap sesi opname (untuk stat cards + ringkasan laporan) via
// useQueries agar jumlah hook tetap aman walau daftar sesi berubah panjang.
export function useOpnameAnalytics(sessions: StockDocumentApi[]): OpnameAnalytics {
  const details = useQueries({
    queries: sessions.map((s) => ({
      queryKey: ["persediaan", "stock-documents", "detail", s.id],
      queryFn: () => api.get<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${s.id}`),
      enabled: typeof window !== "undefined",
    })),
  });

  const detailById = (id: number): StockDocumentApi | undefined =>
    details.find((d) => d.data?.data.id === id)?.data?.data;

  const linesOf = (session: StockDocumentApi): StockDocumentLineApi[] =>
    detailById(session.id)?.lines ?? [];

  const running = sessions.filter((s) => s.status === "Draft").length;
  const unchecked = sessions.reduce((acc, s) => acc + (s.line_count - (s.checked_count ?? 0)), 0);
  const checked = sessions.reduce((acc, s) => acc + (s.checked_count ?? 0), 0);
  const selisih = sessions.reduce(
    (acc, s) => acc + linesOf(s).reduce((b, line) => b + (line.variance ?? 0), 0),
    0,
  );

  return { sessions, running, unchecked, checked, selisih, detailById, linesOf };
}
