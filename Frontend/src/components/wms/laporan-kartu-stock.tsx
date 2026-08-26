import { useCallback, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Boxes, FileSpreadsheet, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { FormCombobox } from "@/components/wms/form-combobox";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { TrxDetailSheet } from "@/components/wms/trx-detail-sheet";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useItems, useWarehouses } from "@/hooks/use-master";
import { useStockCard, useStockDocument } from "@/hooks/use-persediaan";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { StockCardRowApi, ValuationMethod } from "@/lib/persediaan-types";
import { valuationMethodLabels } from "@/lib/persediaan-types";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatIDR,
  formatIDRCompact,
  formatNumber,
  valuationMethods,
  type Trx,
} from "@/lib/wms-data";

const typeTone = (t: string): Tone =>
  t === "Penerimaan"
    ? "success"
    : t === "Pengeluaran" || t === "Stock Adjustment"
      ? "warning"
      : "info";

type CardRow = StockCardRowApi & { warehouse?: string | null; destination?: string | null };

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function LaporanKartuStock() {
  const { data: itemsData, isLoading: itemsLoading } = useItems();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const options = useMemo(() => itemsData?.data ?? [], [itemsData]);
  const [id, setId] = useState<number | null>(null);
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [wh, setWh] = useState(ALL);
  const [from, setFrom] = useState(() =>
    toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)),
  );
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [detail, setDetail] = useState<Trx | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: docDetail, isLoading: docLoading } = useStockDocument(selectedId ?? undefined);

  const activeId = id ?? options[0]?.id;
  const whId = useMemo(
    () => (wh === ALL ? null : (warehouses?.data.find((w) => w.name === wh)?.id ?? null)),
    [warehouses, wh],
  );
  const rangeValid = Boolean(from) && Boolean(to) && from <= to;

  const card = useStockCard(
    activeId,
    method,
    whId,
    rangeValid ? from : null,
    rangeValid ? to : null,
  );

  const item = card.data?.data.item;
  const cardData = card.data?.data;
  const rows = useMemo(() => (cardData?.rows as CardRow[] | undefined) ?? [], [cardData]);
  const unit = item?.unit ?? "pcs";
  const saldoAwal = cardData?.saldo_awal ?? 0;

  const totalMasuk = rows.reduce((a, r) => a + r.masuk, 0);
  const totalKeluar = rows.reduce((a, r) => a + r.keluar, 0);
  const lastRow = rows[rows.length - 1];

  const tableRows = useMemo(() => rows.map((r, i) => ({ ...r, id: `${r.no}-${i}` })), [rows]);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [jenis, setJenis] = useState(ALL);

  const jenisOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);

  const filteredRows = useMemo(
    () =>
      tableRows.filter((r) => {
        if (
          debouncedQ &&
          !`${r.no} ${r.reference} ${r.note} ${r.pic} ${r.partner}`
            .toLowerCase()
            .includes(debouncedQ.toLowerCase())
        )
          return false;
        if (jenis !== ALL && r.type !== jenis) return false;
        return true;
      }),
    [tableRows, debouncedQ, jenis],
  );

  const periodLabel = rangeValid ? `${formatDate(from)} s.d. ${formatDate(to)}` : "Semua periode";
  const warehouseLabel = wh === ALL ? "Semua Gudang" : wh;
  const itemLabel = item ? `${item.name} — ${item.sku}` : "—";

  const handleExportCsv = useCallback(() => {
    const metaRows = [
      { keterangan: "Laporan", nilai: "Kartu Stock" },
      { keterangan: "Periode", nilai: periodLabel },
      { keterangan: "Gudang", nilai: warehouseLabel },
      { keterangan: "Barang", nilai: itemLabel },
      { keterangan: "Metode", nilai: valuationMethodLabels[method] },
      { keterangan: "Saldo Awal", nilai: `${formatNumber(saldoAwal)} ${unit}` },
      { keterangan: "Saldo Akhir", nilai: `${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit}` },
      { keterangan: "Baris", nilai: String(filteredRows.length) },
      { keterangan: "Dicetak", nilai: new Date().toLocaleString("id-ID") },
    ];
    const dataRows = filteredRows.map((r) => ({
      tanggal: formatDate(r.date),
      nomor: r.no,
      jenis: r.type,
      gudang:
        r.warehouse && r.destination && r.destination !== r.warehouse
          ? `${r.warehouse} → ${r.destination}`
          : (r.warehouse ?? "—"),
      satuan: r.unit ?? "—",
      masuk: r.masuk,
      keluar: r.keluar,
      saldo: r.saldo,
      nilai: r.nilai,
      pic: r.pic,
      catatan: r.note,
    }));
    const content =
      toCsv(metaRows, [
        { key: "keterangan", label: "Keterangan" },
        { key: "nilai", label: "Nilai" },
      ]) +
      "\r\n" +
      toCsv(dataRows, [
        { key: "tanggal", label: "Tanggal" },
        { key: "nomor", label: "Nomor" },
        { key: "jenis", label: "Jenis" },
        { key: "gudang", label: "Gudang" },
        { key: "satuan", label: "Satuan" },
        { key: "masuk", label: "Masuk" },
        { key: "keluar", label: "Keluar" },
        { key: "saldo", label: "Saldo" },
        { key: "nilai", label: "Nilai" },
        { key: "pic", label: "PIC" },
        { key: "catatan", label: "Catatan" },
      ]);
    downloadCsv(`laporan-kartu-stock-${from}-${to}.csv`, content);
    toast.success("CSV diunduh");
  }, [
    periodLabel,
    warehouseLabel,
    itemLabel,
    method,
    saldoAwal,
    unit,
    cardData,
    filteredRows,
    from,
    to,
  ]);

  const handlePrint = useCallback(() => {
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Pop-up diblokir — izinkan pop-up untuk mencetak.");
      return;
    }
    const tbody = filteredRows
      .map(
        (r) =>
          `<tr><td>${formatDate(r.date)}</td><td class="mono">${r.no}</td><td>${r.type}</td><td>${r.warehouse ?? "—"}</td><td>${r.masuk ? `+${formatNumber(r.masuk)}` : "-"}</td><td>${r.keluar ? `-${formatNumber(r.keluar)}` : "-"}</td><td><b>${formatNumber(r.saldo)} ${r.unit ?? ""}</b></td><td>${formatIDR(r.nilai)}</td><td>${r.pic}</td><td>${r.note}</td></tr>`,
      )
      .join("");
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>Laporan Kartu Stock</title><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#111;padding:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:12px;color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:11px}th{background:#f5f5f5}.right{text-align:right}.mono{font-family:monospace}</style></head><body><h1>Laporan Kartu Stock</h1><h2>${periodLabel} · ${warehouseLabel} · ${itemLabel} · ${valuationMethodLabels[method]}</h2><p>Saldo Awal ${formatNumber(saldoAwal)} ${unit} · Saldo Akhir ${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit} · ${filteredRows.length} baris</p><table><thead><tr><th>Tanggal</th><th>Nomor</th><th>Jenis</th><th>Gudang</th><th>Masuk</th><th>Keluar</th><th>Saldo</th><th>Nilai</th><th>PIC</th><th>Catatan</th></tr></thead><tbody>${tbody}</tbody></table></body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  }, [filteredRows, periodLabel, warehouseLabel, itemLabel, method, saldoAwal, unit, cardData]);

  const toTrx = (r: CardRow, it: NonNullable<typeof item>): Trx => {
    const qty = r.masuk || r.keluar;
    const type: Trx["type"] =
      r.type === "Penerimaan"
        ? "Barang Masuk"
        : r.type === "Pengeluaran"
          ? "Barang Keluar"
          : "Stock Adjustment";
    return {
      id: `${it.id}-${r.no}`,
      no: r.no,
      type,
      date: r.date,
      warehouse: r.warehouse ?? it.warehouse ?? "—",
      partner: r.partner,
      reference: r.reference,
      qty,
      value: qty * r.unit_cost,
      status: "Selesai",
      pic: r.pic,
      lines: [{ name: it.name, sku: it.sku, qty, unit: r.unit ?? "pcs", price: r.unit_cost }],
    };
  };

  const openDetail = (r: CardRow) => {
    if (r.document_id != null) setSelectedId(r.document_id);
    else if (item) setDetail(toTrx(r, item));
  };

  const columns: Column<(typeof tableRows)[number]>[] = [
    {
      key: "date",
      label: "Tanggal",
      className: "whitespace-nowrap",
      sortable: true,
      render: (r) => formatDate(r.date),
    },
    {
      key: "no",
      label: "Nomor",
      className: "whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <button
          type="button"
          onClick={() => openDetail(r)}
          className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {r.no}
        </button>
      ),
    },
    {
      key: "type",
      label: "Jenis",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={typeTone(r.type)}>{r.type}</Pill>,
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) =>
        r.warehouse && r.destination && r.destination !== r.warehouse
          ? `${r.warehouse} → ${r.destination}`
          : (r.warehouse ?? "—"),
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[80px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.unit ?? "—",
    },
    {
      key: "masuk",
      label: "Masuk",
      className: "text-right w-[100px] whitespace-nowrap text-success",
      sortable: true,
      render: (r) => (r.masuk ? `+${formatNumber(r.masuk)}` : "-"),
    },
    {
      key: "keluar",
      label: "Keluar",
      className: "text-right w-[100px] whitespace-nowrap text-destructive",
      sortable: true,
      render: (r) => (r.keluar ? `-${formatNumber(r.keluar)}` : "-"),
    },
    {
      key: "saldo",
      label: "Saldo",
      className: "text-right w-[100px] whitespace-nowrap font-semibold",
      sortable: true,
      render: (r) => `${formatNumber(r.saldo)} ${r.unit ?? ""}`,
    },
    {
      key: "nilai",
      label: `Nilai (${method})`,
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatIDR(r.nilai),
    },
    {
      key: "pic",
      label: "PIC",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.pic,
    },
    {
      key: "note",
      label: "Catatan",
      className: "max-w-[240px]",
      render: (r) => (
        <span className="block truncate text-muted-foreground" title={r.note}>
          {r.note}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Laporan Kartu Stock"
        description={`${periodLabel} · ${warehouseLabel} · ${itemLabel}`}
        actions={
          <>
            <div className="flex rounded-xl border border-border bg-card p-1">
              {valuationMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    method === m
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {valuationMethodLabels[m]}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handlePrint}
              disabled={filteredRows.length === 0}
            >
              <Printer className="h-4 w-4" /> Cetak
            </Button>
          </>
        }
      />

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-5">
          <FormCombobox
            value={activeId != null ? String(activeId) : ""}
            onValueChange={(v) => setId(Number(v))}
            options={options.map((o) => ({
              value: String(o.id),
              label: `${o.name} — ${o.sku}`,
              keywords: `${o.name} ${o.sku} ${o.barcode ?? ""} ${o.internal_barcode ?? ""}`.trim(),
            }))}
            placeholder="Pilih barang…"
            searchPlaceholder="Cari nama, SKU, barcode…"
            loading={itemsLoading}
            className="w-full"
          />
          <FilterSelect
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
            className="w-full"
          />
          <FilterSelect
            value={jenis}
            onChange={setJenis}
            placeholder="Semua Jenis"
            options={Array.from(new Set(rows.map((r) => r.type)))}
            loading={card.isFetching}
            className="w-full"
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-xl"
            aria-label="Dari tanggal"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-xl"
            aria-label="Sampai tanggal"
          />
        </div>
        {!rangeValid && (
          <p className="mt-2 text-xs text-destructive">
            Rentang tanggal tidak valid (Dari harus ≤ Sampai).
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo Awal"
          value={`${formatNumber(saldoAwal)} ${unit}`}
          icon={Boxes}
          tone="info"
        />
        <StatCard
          label="Total Masuk"
          value={`${formatNumber(totalMasuk)} ${unit}`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatCard
          label="Total Keluar"
          value={`${formatNumber(totalKeluar)} ${unit}`}
          icon={ArrowUpRight}
          tone="warning"
        />
        <StatCard
          label={`Nilai Akhir — ${valuationMethodLabels[method]}`}
          value={formatIDRCompact(lastRow?.nilai ?? 0)}
          valueTitle={formatIDR(lastRow?.nilai ?? 0)}
          hint={`${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit} × ${formatIDR(lastRow?.method_cost ?? 0)}`}
          icon={Wallet}
        />
      </div>

      <Panel
        title={item?.name ?? "Memuat…"}
        description={`${item?.sku ?? ""} · saldo akhir ${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit} · ${periodLabel}`}
        bodyClassName="p-0"
      >
        <DataTable
          columns={columns}
          rows={filteredRows}
          pageSize={10}
          loading={itemsLoading || card.isFetching}
          onRowClick={(r) => openDetail(r)}
          initialSort={{ key: "date", dir: "asc" }}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.no}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                </div>
                <Pill tone={typeTone(r.type)}>{r.type}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.warehouse ?? "—"} · {r.unit ?? "—"} · Saldo {formatNumber(r.saldo)}
              </p>
              <p className="truncate text-xs text-muted-foreground">Catatan: {r.note}</p>
            </div>
          )}
        />
      </Panel>

      <TrxDetailSheet trx={detail} onOpenChange={(o) => !o && setDetail(null)} editable={false} />
      <StockDocumentSheet
        doc={docDetail?.data ?? null}
        isLoading={docLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
