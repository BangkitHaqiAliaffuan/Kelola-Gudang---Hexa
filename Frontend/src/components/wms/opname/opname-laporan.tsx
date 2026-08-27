import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import {
  opnameLabel,
  opnameLabelTone,
  opnameLineValue,
  opnameReasonLabel,
  opnameSessionSummary,
  useOpnameAnalytics,
} from "@/components/wms/opname/opname-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocuments } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { buildStockDocumentSearchText } from "@/lib/stock-document-search";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

export function OpnameLaporanPage() {
  const { data, isLoading } = useStockDocuments({ type: "Stock Opname" });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const sessions = useMemo(() => data?.data ?? [], [data]);
  const analytics = useOpnameAnalytics(sessions);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visible, setVisible] = useState(2);
  const hasActiveFilters = useMemo(
    () => q !== "" || wh !== ALL || status !== ALL || dateFrom !== "" || dateTo !== "",
    [q, wh, status, dateFrom, dateTo],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setWh(ALL);
    setStatus(ALL);
    setDateFrom("");
    setDateTo("");
    setVisible(2);
  }, []);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");
  const searchIndex = useMemo(
    () => new Map(sessions.map((s) => [s.id, buildStockDocumentSearchText(s)])),
    [sessions],
  );

  const filtered = useMemo(() => {
    const dayOk = (day: string) => {
      if (dateFrom && dateTo) return day >= dateFrom && day <= dateTo;
      if (dateFrom) return day === dateFrom;
      if (dateTo) return day === dateTo;
      return true;
    };
    return sessions.filter(
      (s) =>
        (!qn || searchIndex.get(s.id)!.includes(qn)) &&
        (wh === ALL || s.warehouse === wh) &&
        (status === ALL || opnameLabel(s) === status) &&
        dayOk(s.document_date.slice(0, 10)),
    );
  }, [sessions, qn, searchIndex, wh, status, dateFrom, dateTo]);

  const shown = filtered.slice(0, visible);

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
          reason: opnameReasonLabel(l.reason_code),
          counted_by: l.counted_by ?? "",
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
        { key: "reason", label: "Alasan Selisih" },
        { key: "counted_by", label: "Dicek Oleh" },
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
          value={isLoading ? "…" : formatNumber(analytics.running)}
          icon={ClipboardCheck}
          loading={isLoading}
        />
        <StatCard
          label="Belum Dicek"
          value={isLoading ? "…" : formatNumber(analytics.unchecked)}
          icon={TriangleAlert}
          tone="warning"
          loading={isLoading}
        />
        <StatCard
          label="Sudah Dicek"
          value={isLoading ? "…" : formatNumber(analytics.checked)}
          icon={ClipboardCheck}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          label="Selisih"
          value={isLoading ? "…" : formatNumber(analytics.selisih)}
          icon={TriangleAlert}
          tone="danger"
          loading={isLoading}
        />
      </div>

      <Panel
        title="Summary per Sesi"
        description={isLoading ? "Memuat sesi..." : `${formatNumber(filtered.length)} sesi`}
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(2);
            }}
            placeholder="Cari kode, gudang, PIC, tanggal, status..."
            className="rounded-xl"
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={wh}
            onChange={(v) => {
              setWh(v);
              setVisible(2);
            }}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full flex-1 min-w-[140px] max-w-[180px]"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setVisible(2);
            }}
            placeholder="Semua Status"
            options={["Dijadwalkan", "Berjalan", "Selesai", "Dibatalkan"]}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Dari</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setVisible(2);
                }}
                className="h-9 rounded-xl"
                aria-label="Dari tanggal"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sampai</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setVisible(2);
                }}
                className="h-9 rounded-xl"
                aria-label="Sampai tanggal"
              />
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Memuat sesi...</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tidak ada sesi yang cocok dengan filter.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((s) => {
              const label = opnameLabel(s);
              const lineCount = s.line_count;
              const sum = summary.get(s.id) ?? opnameSessionSummary([]);
              return (
                <Link
                  key={s.id}
                  to="/opname/laporan/$docId"
                  params={{ docId: String(s.id) }}
                  className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-accent/40"
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
                </Link>
              );
            })}
          </div>
        )}

        {filtered.length > shown.length && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Menampilkan {formatNumber(shown.length)} dari {formatNumber(filtered.length)} sesi
            </p>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setVisible((v) => Math.min(v + 2, filtered.length))}
            >
              Tampilkan Lebih Banyak ({formatNumber(filtered.length - shown.length)} tersisa)
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
