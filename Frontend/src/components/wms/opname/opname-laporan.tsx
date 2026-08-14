import { useMemo, useState } from "react";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import {
  opnameLabel,
  opnameLabelTone,
  opnameLineValue,
  opnameSessionSummary,
  useOpnameAnalytics,
} from "@/components/wms/opname/opname-utils";
import { Button } from "@/components/ui/button";
import { useStockDocuments } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

export function OpnameLaporanPage() {
  const { data, isLoading } = useStockDocuments({ type: "Stock Opname" });
  const sessions = useMemo(() => data?.data ?? [], [data]);
  const analytics = useOpnameAnalytics(sessions);

  const [activeId, setActiveId] = useState<number | null>(null);
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null;
  const activeLines = active ? analytics.linesOf(active) : [];

  const exportCsv = () => {
    const rows: Record<string, unknown>[] = [];
    for (const s of sessions) {
      const lines = analytics.linesOf(s);
      for (const l of lines) {
        rows.push({
          no: s.no,
          warehouse: s.warehouse ?? "",
          date: formatDate(s.document_date),
          pic: s.pic ?? "",
          status: opnameLabel(s),
          sku: l.sku ?? "",
          name: l.name ?? "",
          unit: l.unit ?? "",
          rack: l.from_rack ?? "",
          bin: l.from_bin ?? "",
          system: l.system_qty ?? 0,
          actual: l.actual_qty ?? "",
          variance: l.variance ?? "",
          value: formatIDR(opnameLineValue(l)),
        });
      }
    }
    downloadCsv(
      `laporan-opname-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { key: "no", label: "No Dokumen" },
        { key: "warehouse", label: "Gudang" },
        { key: "date", label: "Tanggal" },
        { key: "pic", label: "PIC" },
        { key: "status", label: "Status" },
        { key: "sku", label: "SKU" },
        { key: "name", label: "Barang" },
        { key: "unit", label: "Satuan" },
        { key: "rack", label: "Rak" },
        { key: "bin", label: "Bin" },
        { key: "system", label: "Sistem" },
        { key: "actual", label: "Fisik" },
        { key: "variance", label: "Selisih" },
        { key: "value", label: "Nilai Selisih" },
      ]),
    );
    toast.success("Laporan opname diexport");
  };

  const summary = useMemo(
    () => new Map(sessions.map((s) => [s.id, opnameSessionSummary(analytics.linesOf(s))])),
    [sessions, analytics],
  );

  return (
    <>
      <PageHeader
        title="Laporan Opname"
        description="Ringkasan dan detail hasil tiap sesi opname"
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={exportCsv}
            disabled={sessions.length === 0}
          >
            <ClipboardCheck className="h-4 w-4" /> Export Laporan
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sedang Berjalan"
          value={formatNumber(analytics.running)}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Belum Dicek"
          value={formatNumber(analytics.unchecked)}
          icon={TriangleAlert}
          tone="warning"
        />
        <StatCard
          label="Sudah Dicek"
          value={formatNumber(analytics.checked)}
          icon={ClipboardCheck}
          tone="success"
        />
        <StatCard
          label="Selisih"
          value={formatNumber(analytics.selisih)}
          icon={TriangleAlert}
          tone="danger"
        />
      </div>

      <Panel
        title="Summary per Sesi"
        description={isLoading ? "Memuat sesi..." : "Ringkasan hasil dan selisih tiap opname"}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => {
            const label = opnameLabel(s);
            const lineCount = s.line_count;
            const sum = summary.get(s.id) ?? opnameSessionSummary([]);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active?.id === s.id
                    ? "border-primary/40 bg-primary-soft"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate text-sm font-semibold">{s.warehouse ?? "—"}</p>
                  <Pill tone={opnameLabelTone(label)}>{label}</Pill>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {s.no} · {formatDate(s.document_date)} · PIC {s.pic ?? "—"}
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Item</p>
                    <b>{formatNumber(lineCount)}</b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tercatat</p>
                    <b>{formatNumber(sum.checked)}</b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Lebih</p>
                    <b className="text-success">{formatNumber(sum.plus)}</b>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Kurang</p>
                    <b className="text-destructive">{formatNumber(sum.minus)}</b>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Nilai selisih: <b className="text-foreground">{formatIDR(sum.value)}</b>
                </p>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={active ? `Detail Selisih — ${active.no}` : "Detail Selisih"}
        description="Perbandingan stok sistem dan fisik"
      >
        {!active ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada sesi opname.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {[
                      "Barang",
                      "SKU",
                      "Satuan",
                      "Rak",
                      "Bin",
                      "Sistem",
                      "Fisik",
                      "Selisih",
                      "Nilai Selisih",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLines.map((l) => {
                    const variance = l.variance ?? 0;
                    return (
                      <tr key={l.id} className="border-b border-border/60 hover:bg-accent/40">
                        <td className="px-3 py-2.5">{l.name ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{l.sku ?? "—"}</td>
                        <td className="px-3 py-2.5">{l.unit ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{l.from_rack ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{l.from_bin ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          {formatNumber(l.system_qty ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {l.actual_qty != null ? formatNumber(l.actual_qty) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Pill
                            tone={variance === 0 ? "success" : variance > 0 ? "info" : "danger"}
                          >
                            {l.actual_qty != null
                              ? `${variance > 0 ? "+" : ""}${formatNumber(variance)} ${l.unit ?? ""}`
                              : "—"}
                          </Pill>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {l.actual_qty != null ? formatIDR(opnameLineValue(l)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {activeLines.map((l) => {
                const variance = l.variance ?? 0;
                return (
                  <div key={l.id} className="rounded-xl border border-border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="truncate text-sm font-semibold">{l.name ?? "—"}</p>
                      <Pill tone={variance === 0 ? "success" : variance > 0 ? "info" : "danger"}>
                        {l.actual_qty != null
                          ? `${variance > 0 ? "+" : ""}${formatNumber(variance)} ${l.unit ?? ""}`
                          : "—"}
                      </Pill>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {l.sku ?? "—"}
                    </p>
                    <p className="mt-1 text-xs">
                      Sistem <b>{formatNumber(l.system_qty ?? 0)}</b> · Fisik{" "}
                      <b>{l.actual_qty != null ? formatNumber(l.actual_qty) : "—"}</b> · Rak{" "}
                      {l.from_rack ?? "—"} / Bin {l.from_bin ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nilai selisih:{" "}
                      <b className="text-foreground">{formatIDR(opnameLineValue(l))}</b>
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
