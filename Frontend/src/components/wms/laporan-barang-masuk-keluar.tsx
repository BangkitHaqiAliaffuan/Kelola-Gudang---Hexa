import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ClipboardList,
  FileSpreadsheet,
  Package,
  Printer,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ALL, EmptyState, FilterSelect, PageHeader, Panel, Pill, StatCard, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { StockDocumentSheet } from "./stock-document-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import { stockDocumentStatuses, type StockDocumentApi } from "@/lib/persediaan-types";
import { buildStockDocumentSearchText } from "@/lib/stock-document-search";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";

const statusTone = (s: StockDocumentApi["status"]): Tone =>
  s === "Selesai"
    ? "success"
    : s === "Draft"
      ? "neutral"
      : s === "Dibatalkan"
        ? "danger"
        : "warning";

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Laporan Barang Masuk / Barang Keluar berbasis API (`GET /api/persediaan/stock-documents`).
 * Scope server: type + rentang tanggal + gudang. Filter client: cari / partner / status.
 * `placeholderData: keepPreviousData` membuat data lama tetap tampil saat ganti scope.
 */
export function LaporanBarangMasukKeluar({ type }: { type: "Penerimaan" | "Pengeluaran" }) {
  const isMasuk = type === "Penerimaan";
  const title = isMasuk ? "Laporan Barang Masuk" : "Laporan Barang Keluar";
  const partnerLabel = isMasuk ? "Supplier" : "Tujuan";

  const { status: authStatus, hasModuleLevel } = useAuth();
  const canView = hasModuleLevel("Laporan", "Baca");
  const noAccess = authStatus === "authenticated" && !canView;

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState(() =>
    toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)),
  );
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const whId = useMemo(
    () => (wh === ALL ? null : (warehouses?.data.find((w) => w.name === wh)?.id ?? null)),
    [wh, warehouses],
  );
  const rangeValid = Boolean(from) && Boolean(to) && from <= to;

  const { data, isLoading, isFetching } = useStockDocuments({
    type,
    warehouseId: whId,
    from: from || null,
    to: to || null,
    enabled: canView && rangeValid,
  });
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const searchIndex = useMemo(
    () => new Map((data?.data ?? []).map((d) => [d.id, buildStockDocumentSearchText(d)])),
    [data],
  );

  const partners = useMemo(
    () =>
      Array.from(
        new Set((data?.data ?? []).map((d) => d.partner).filter((p): p is string => !!p)),
      ).sort(),
    [data],
  );

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (d) =>
          (!qn || searchIndex.get(d.id)!.includes(qn)) &&
          (partner === ALL || d.partner === partner) &&
          (status === ALL || d.status === status),
      ),
    [data, qn, searchIndex, partner, status],
  );

  const stats = useMemo(() => {
    const docs = rows.length;
    const qty = rows.reduce((s, d) => s + Math.abs(d.qty_total ?? 0), 0);
    const nilai = rows.reduce((s, d) => s + Math.abs(d.value_total ?? 0), 0);
    const belumPosting = rows.filter(
      (d) => d.status !== "Selesai" && d.status !== "Dibatalkan",
    ).length;
    return { docs, qty, nilai, belumPosting };
  }, [rows]);

  const chart = useMemo(
    () =>
      [
        ...rows
          .reduce((byMonth, d) => {
            const key = d.document_date.slice(0, 7);
            return byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(d.qty_total ?? 0));
          }, new Map<string, number>())
          .entries(),
      ]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([key, qty]) => ({ month: formatDate(`${key}-01`), qty })),
    [rows],
  );

  const periodLabel =
    from && to && from <= to ? `${formatDate(from)} s.d. ${formatDate(to)}` : "Semua periode";

  const handleExportCsv = () => {
    const metaRows = [
      { keterangan: "Laporan", nilai: title },
      { keterangan: "Periode", nilai: periodLabel },
      { keterangan: "Gudang", nilai: wh === ALL ? "Semua" : wh },
      { keterangan: partnerLabel, nilai: partner === ALL ? "Semua" : partner },
      { keterangan: "Status", nilai: status === ALL ? "Semua" : status },
      { keterangan: "Baris", nilai: `${formatNumber(rows.length)} dokumen` },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = rows.map((d) => ({
      no: d.no,
      tanggal: d.document_date,
      tipe: d.type,
      gudang: d.warehouse ?? "—",
      partner: d.partner ?? "—",
      referensi: d.reference_no ?? "—",
      qty: Math.abs(d.qty_total ?? 0),
      nilai: Math.abs(d.value_total ?? 0),
      pic: d.pic ?? "—",
      status: d.status,
    }));
    const content =
      toCsv(metaRows, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(dataRows, [
        { key: "no", label: "Nomor" },
        { key: "tanggal", label: "Tanggal" },
        { key: "tipe", label: "Tipe" },
        { key: "gudang", label: "Gudang" },
        { key: "partner", label: partnerLabel },
        { key: "referensi", label: "Referensi" },
        { key: "qty", label: "Qty" },
        { key: "nilai", label: "Nilai" },
        { key: "pic", label: "PIC" },
        { key: "status", label: "Status" },
      ]);
    downloadCsv(`laporan-${isMasuk ? "barang-masuk" : "barang-keluar"}-${from}-${to}.csv`, content);
    toast.success("CSV diunduh");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
      return;
    }
    const tbody = rows
      .map(
        (d) => `
      <tr>
        <td class="mono">${d.no}</td>
        <td>${formatDate(d.document_date)}</td>
        <td>${d.warehouse ?? "—"}</td>
        <td>${d.partner ?? "—"}</td>
        <td>${d.reference_no ?? "—"}</td>
        <td class="right">${formatNumber(Math.abs(d.qty_total ?? 0))}</td>
        <td class="right">${formatIDR(Math.abs(d.value_total ?? 0))}</td>
        <td>${d.pic ?? "—"}</td>
        <td>${d.status}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"/>
<title>${title}</title>
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
<h1>${title}</h1>
<p class="mono muted">Periode: ${periodLabel} · ${wh === ALL ? "Semua Gudang" : wh} · ${formatNumber(rows.length)} dokumen</p>
<table>
  <thead><tr><th>Nomor</th><th>Tanggal</th><th>Gudang</th><th>${partnerLabel}</th><th>Referensi</th><th class="right">Qty</th><th class="right">Nilai</th><th>PIC</th><th>Status</th></tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot"><span>Dicetak: ${new Date().toLocaleString("id-ID")}</span><span>KelolaGudang Pro</span></div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  };

  const columns: Column<StockDocumentApi>[] = [
    {
      key: "no",
      label: "Nomor",
      className: "w-[170px] whitespace-nowrap",
      sortable: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.no}</span>,
    },
    {
      key: "document_date",
      label: "Tanggal",
      className: "w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatDate(r.document_date),
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "partner",
      label: partnerLabel,
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.partner ?? "—",
    },
    {
      key: "reference_no",
      label: "Referensi",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.reference_no ?? "—",
    },
    {
      key: "qty_total",
      label: "Qty",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => Math.abs(r.qty_total ?? 0),
      render: (r) => formatNumber(Math.abs(r.qty_total ?? 0)),
    },
    {
      key: "value_total",
      label: "Nilai",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => Math.abs(r.value_total ?? 0),
      render: (r) => formatIDR(Math.abs(r.value_total ?? 0)),
    },
    {
      key: "pic",
      label: "PIC",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.pic ?? "—",
    },
    {
      key: "status",
      label: "Status",
      className: "w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  if (noAccess) {
    return (
      <EmptyState
        title="Tidak memiliki akses"
        description="Akun Anda tidak memiliki akses Baca pada modul Persediaan. Hubungi administrator untuk mengatur hak akses."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description="Data dari sistem persediaan (dokumen Penerimaan/Pengeluaran)"
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExportCsv}
              disabled={rows.length === 0 || !rangeValid}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handlePrint}
              disabled={rows.length === 0 || !rangeValid}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Dokumen"
          value={isLoading || isFetching ? "…" : formatNumber(stats.docs)}
          icon={ClipboardList}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Total Qty"
          value={isLoading || isFetching ? "…" : `${formatNumber(stats.qty)} unit`}
          icon={Package}
          tone="info"
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Total Nilai"
          value={isLoading || isFetching ? "…" : formatIDRCompact(stats.nilai)}
          icon={Wallet}
          tone="success"
          {...(isLoading || isFetching ? {} : { valueTitle: formatIDR(stats.nilai) })}
          loading={isLoading || isFetching}
        />
        <StatCard
          label="Belum Posting"
          value={isLoading || isFetching ? "…" : formatNumber(stats.belumPosting)}
          icon={TriangleAlert}
          tone="danger"
          valueTitle={
            isLoading || isFetching
              ? undefined
              : `${formatNumber(stats.belumPosting)} dokumen belum diposting`
          }
          loading={isLoading || isFetching}
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, gudang, PIC, tanggal, referensi, status..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full"
            value={partner}
            onChange={setPartner}
            placeholder={`Semua ${partnerLabel}`}
            options={partners}
            loading={isLoading}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={[...stockDocumentStatuses]}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Dari tanggal"
            className="rounded-xl"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Sampai tanggal"
            className="rounded-xl"
          />
        </div>
      </Panel>

      <Panel title="Qty per Bulan" description={periodLabel}>
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
                formatter={(value) => [formatNumber(Number(value)), "Qty"]}
              />
              <Bar dataKey="qty" name="Qty" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="Belum ada data"
            description="Tidak ada dokumen pada periode dan filter ini."
          />
        )}
      </Panel>

      <Panel
        title="Detail Laporan"
        description={`${formatNumber(rows.length)} dokumen${isFetching ? " · memperbarui..." : ""}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          initialSort={{ key: "document_date", dir: "desc" }}
          onRowClick={(r) => setSelectedId(r.id)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(r.document_date)} · {r.warehouse ?? "—"}
              </p>
              <p className="truncate text-xs">{r.partner ?? "—"}</p>
              <div className="flex justify-between pt-1 text-xs">
                <span>{formatNumber(Math.abs(r.qty_total ?? 0))} unit</span>
                <b>{formatIDR(Math.abs(r.value_total ?? 0))}</b>
              </div>
            </div>
          )}
        />
      </Panel>

      <StockDocumentSheet
        doc={detail?.data ?? null}
        isLoading={detailLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
