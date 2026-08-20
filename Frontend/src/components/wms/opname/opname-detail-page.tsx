import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ChevronLeft,
  ClipboardCheck,
  FileSpreadsheet,
  ListChecks,
  Package,
  Printer,
  Search,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import {
  opnameLabel,
  opnameLabelTone,
  opnameLineValue,
  opnameReasonCodes,
  opnameReasonLabel,
  opnameSessionSummary,
} from "@/components/wms/opname/opname-utils";
import type { StockDocumentLineApi } from "@/lib/persediaan-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useStockDocument } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

const varianceTone = (l: StockDocumentLineApi): "neutral" | "success" | "info" | "danger" => {
  if (l.actual_qty == null) return "neutral";
  const variance = l.variance ?? 0;
  return variance === 0 ? "success" : variance > 0 ? "info" : "danger";
};

/**
 * Detail selisih satu sesi Stock Opname, dibuka dari /opname/laporan.
 * Read-only: fetch detail on-demand via useStockDocument, tabel + filter +
 * export/print per sesi (independen dari overview yang fetch eager).
 */
export function OpnameDetailPage({ docId }: { docId: number }) {
  const router = useRouter();
  const { data: detail, isLoading } = useStockDocument(docId);
  const doc = detail?.data ?? null;
  const lines = useMemo(() => doc?.lines ?? [], [doc]);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [dir, setDir] = useState(ALL);
  const [reason, setReason] = useState(ALL);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const rows = useMemo(
    () =>
      lines.filter((l) => {
        const variance = l.variance ?? 0;
        const counted = l.actual_qty != null;
        const dirOk =
          dir === ALL ||
          (dir === "Belum Dicek" && !counted) ||
          (dir === "Netral" && counted && variance === 0) ||
          (dir === "Selisih" && counted && variance !== 0) ||
          (dir === "Lebih" && variance > 0) ||
          (dir === "Kurang" && variance < 0);
        if (!dirOk) return false;
        if (reason !== ALL && opnameReasonLabel(l.reason_code) !== reason) return false;
        if (!qn) return true;
        return (
          (l.sku ?? "").toLowerCase().includes(qn) || (l.name ?? "").toLowerCase().includes(qn)
        );
      }),
    [lines, qn, dir, reason],
  );

  const summary = useMemo(() => opnameSessionSummary(lines), [lines]);

  const goBack = () => router.navigate({ to: "/opname/$section", params: { section: "laporan" } });

  if (isLoading && !doc) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Memuat sesi opname...</p>;
  }

  if (!doc) {
    return (
      <>
        <PageHeader
          title="Detail Opname"
          description="Sesi opname tidak ditemukan"
          actions={
            <Button variant="outline" className="rounded-xl" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Kembali ke Laporan
            </Button>
          }
        />
        <Panel>
          <EmptyState
            title="Sesi tidak ditemukan"
            description="Sesi opname mungkin telah dihapus atau tautan tidak valid."
          />
        </Panel>
      </>
    );
  }

  if (doc.type !== "Stock Opname") {
    return (
      <>
        <PageHeader
          title="Detail Opname"
          description="Bukan sesi opname"
          actions={
            <Button variant="outline" className="rounded-xl" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Kembali ke Laporan
            </Button>
          }
        />
        <Panel>
          <EmptyState
            title="Bukan sesi opname"
            description="Dokumen ini bukan tipe Stock Opname, sehingga detail selisih tidak tersedia."
          />
        </Panel>
      </>
    );
  }

  const handleExportCsv = () => {
    const metaRows = [
      { keterangan: "Laporan", nilai: "Detail Opname" },
      { keterangan: "Nomor", nilai: doc.no },
      { keterangan: "Gudang", nilai: doc.warehouse ?? "—" },
      { keterangan: "Tanggal", nilai: formatDate(doc.document_date) },
      { keterangan: "PIC", nilai: doc.pic ?? "—" },
      { keterangan: "Status", nilai: opnameLabel(doc) },
      {
        keterangan: "Baris",
        nilai: `${formatNumber(rows.length)} dari ${formatNumber(lines.length)}`,
      },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = rows.map((l) => ({
      sku: l.sku ?? "",
      name: l.name ?? "",
      unit: l.unit ?? "",
      rack: l.from_rack ?? "",
      bin: l.from_bin ?? "",
      system: l.system_qty ?? 0,
      actual: l.actual_qty ?? "",
      variance: l.actual_qty != null ? (l.variance ?? 0) : "",
      value: l.actual_qty != null ? formatIDR(opnameLineValue(l)) : "",
      reason: opnameReasonLabel(l.reason_code),
      counted_by: l.counted_by ?? "",
    }));
    const content =
      toCsv(metaRows, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(dataRows, [
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
      ]);
    downloadCsv(`detail-opname-${doc.no.replace(/\//g, "-")}.csv`, content);
    toast.success("CSV diunduh");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
      return;
    }
    const tbody = rows
      .map((l) => {
        const variance = l.variance ?? 0;
        return `
      <tr>
        <td>${l.name ?? "—"}</td>
        <td class="mono">${l.sku ?? "—"}</td>
        <td>${l.unit ?? "—"}</td>
        <td class="mono">${l.from_rack ?? "—"}</td>
        <td class="mono">${l.from_bin ?? "—"}</td>
        <td class="right">${formatNumber(l.system_qty ?? 0)}</td>
        <td class="right">${l.actual_qty != null ? formatNumber(l.actual_qty) : "—"}</td>
        <td class="right">${l.actual_qty != null ? `${variance > 0 ? "+" : ""}${formatNumber(variance)}` : "—"}</td>
        <td class="right">${l.actual_qty != null ? formatIDR(opnameLineValue(l)) : "—"}</td>
        <td>${opnameReasonLabel(l.reason_code)}</td>
        <td>${l.counted_by ?? "—"}</td>
      </tr>`;
      })
      .join("");
    win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>Detail Opname — ${doc.no}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px}
  h1{font-size:18px;margin:0}
  .mono{font-family:Consolas,monospace}
  .muted{color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
  th{background:#f1f5f9;font-size:12px}
  .right{text-align:right}
  .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
</style></head><body>
<h1>Detail Opname — ${doc.no}</h1>
<p class="mono muted">${doc.warehouse ?? "—"} · ${formatDate(doc.document_date)} · PIC ${doc.pic ?? "—"} · ${opnameLabel(doc)} · ${formatNumber(rows.length)} baris</p>
<table>
  <thead><tr><th>Barang</th><th>SKU</th><th>Satuan</th><th>Rak</th><th>Bin</th><th class="right">Sistem</th><th class="right">Fisik</th><th class="right">Selisih</th><th class="right">Nilai</th><th>Alasan</th><th>Dicek Oleh</th></tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  };

  const columns: Column<StockDocumentLineApi>[] = [
    {
      key: "name",
      label: "Barang",
      className: "min-w-[180px] whitespace-nowrap",
      sortable: true,
      render: (l) => <span className="font-medium">{l.name ?? "—"}</span>,
    },
    {
      key: "sku",
      label: "SKU",
      className: "min-w-[100px] whitespace-nowrap",
      sortable: true,
      render: (l) => <span className="font-mono text-xs">{l.sku ?? "—"}</span>,
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[80px] whitespace-nowrap",
      sortable: true,
      render: (l) => l.unit ?? "—",
    },
    {
      key: "from_rack",
      label: "Rak",
      className: "w-[80px] whitespace-nowrap",
      sortable: true,
      render: (l) => l.from_rack ?? "—",
    },
    {
      key: "from_bin",
      label: "Bin",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      render: (l) => <span className="font-mono text-xs">{l.from_bin ?? "—"}</span>,
    },
    {
      key: "system_qty",
      label: "Sistem",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (l) => l.system_qty ?? 0,
      render: (l) => formatNumber(l.system_qty ?? 0),
    },
    {
      key: "actual_qty",
      label: "Fisik",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (l) => l.actual_qty ?? -Infinity,
      render: (l) => (l.actual_qty != null ? formatNumber(l.actual_qty) : "—"),
    },
    {
      key: "variance",
      label: "Selisih",
      className: "w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (l) => (l.actual_qty != null ? (l.variance ?? 0) : -Infinity),
      render: (l) => {
        const variance = l.variance ?? 0;
        return (
          <Pill tone={varianceTone(l)}>
            {l.actual_qty != null
              ? `${variance > 0 ? "+" : ""}${formatNumber(variance)} ${l.unit ?? ""}`
              : "—"}
          </Pill>
        );
      },
    },
    {
      key: "value",
      label: "Nilai Selisih",
      className: "text-right w-[140px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (l) => opnameLineValue(l),
      render: (l) =>
        l.actual_qty != null ? (
          <span className="font-semibold">{formatIDR(opnameLineValue(l))}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "reason_code",
      label: "Alasan",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (l) => <span className="text-xs">{opnameReasonLabel(l.reason_code)}</span>,
    },
    {
      key: "counted_by",
      label: "Dicek Oleh",
      className: "min-w-[110px] whitespace-nowrap",
      sortable: true,
      render: (l) => l.counted_by ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        title={`Detail Opname — ${doc.no}`}
        description={`${doc.warehouse ?? "—"} · ${formatDate(doc.document_date)} · PIC ${doc.pic ?? "—"} · ${formatNumber(lines.length)} baris`}
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handlePrint}
              disabled={rows.length === 0}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Kembali ke Laporan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Item" value={formatNumber(lines.length)} icon={Package} />
        <StatCard
          label="Tercatat"
          value={formatNumber(summary.checked)}
          icon={ClipboardCheck}
          tone="success"
        />
        <StatCard
          label="Belum Dicek"
          value={formatNumber(summary.uncounted)}
          icon={ListChecks}
          tone="warning"
        />
        <StatCard label="Lebih" value={formatNumber(summary.plus)} icon={TrendingUp} tone="info" />
        <StatCard
          label="Kurang"
          value={formatNumber(summary.minus)}
          icon={TrendingDown}
          tone="danger"
        />
        <StatCard
          label="Nilai Selisih"
          value={formatIDR(summary.value)}
          icon={TriangleAlert}
          valueTitle={formatIDR(summary.value)}
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari SKU atau nama barang..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={dir}
            onChange={setDir}
            placeholder="Semua Arah Selisih"
            options={["Belum Dicek", "Selisih", "Lebih", "Kurang", "Netral"]}
          />
          <FilterSelect
            className="w-full"
            value={reason}
            onChange={setReason}
            placeholder="Semua Alasan"
            options={Object.values(opnameReasonCodes)}
          />
        </div>
      </Panel>

      <Panel
        title="Detail Selisih"
        description={`${formatNumber(rows.length)} dari ${formatNumber(lines.length)} baris`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          mobileCard={(l) => {
            const variance = l.variance ?? 0;
            return (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">{l.name ?? "—"}</p>
                  <Pill tone={varianceTone(l)}>
                    {l.actual_qty != null
                      ? `${variance > 0 ? "+" : ""}${formatNumber(variance)} ${l.unit ?? ""}`
                      : "—"}
                  </Pill>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">{l.sku ?? "—"}</p>
                <p className="text-xs">
                  Sistem <b>{formatNumber(l.system_qty ?? 0)}</b> · Fisik{" "}
                  <b>{l.actual_qty != null ? formatNumber(l.actual_qty) : "—"}</b> · Rak{" "}
                  {l.from_rack ?? "—"} / Bin {l.from_bin ?? "—"}
                </p>
                <div className="flex justify-between gap-2 pt-1 text-xs">
                  <span className="truncate">{opnameReasonLabel(l.reason_code)}</span>
                  <b>{l.actual_qty != null ? formatIDR(opnameLineValue(l)) : "—"}</b>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dicek: <b className="text-foreground">{l.counted_by ?? "—"}</b>
                </p>
              </div>
            );
          }}
        />
      </Panel>
    </>
  );
}
