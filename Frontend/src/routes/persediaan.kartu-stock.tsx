import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Maximize2,
  Minimize2,
  Printer,
  ScanLine,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { TrxDetailSheet } from "@/components/wms/trx-detail-sheet";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/components/wms/data-table";
import { FormCombobox } from "@/components/wms/form-combobox";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useItems, useWarehouses } from "@/hooks/use-master";
import { useStockCard, useStockDocument } from "@/hooks/use-persediaan";
import { findItemByCode } from "@/lib/barcode-label";
import type { StockCardRowApi, ValuationMethod } from "@/lib/persediaan-types";
import { valuationMethodLabels } from "@/lib/persediaan-types";
import {
  formatDate,
  formatIDR,
  formatIDRCompact,
  formatNumber,
  valuationMethods,
  type Trx,
} from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/kartu-stock")({
  head: () => ({
    meta: [
      { title: "Kartu Stock — KelolaGudang" },
      { name: "description", content: "Riwayat mutasi masuk, keluar, dan saldo stok per barang." },
      { property: "og:title", content: "Kartu Stock — KelolaGudang" },
      {
        property: "og:description",
        content: "Telusuri pergerakan stok tiap barang secara detail.",
      },
    ],
  }),
  component: KartuStock,
});

const typeTone = (t: string): Tone =>
  t === "Penerimaan"
    ? "success"
    : t === "Pengeluaran" || t === "Stock Adjustment"
      ? "warning"
      : "info";

type CardRow = StockCardRowApi & {
  warehouse?: string | null;
  destination?: string | null;
  source?: string | null;
};

function KartuStock() {
  const { data: itemsData, isLoading: itemsLoading } = useItems();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const options = useMemo(() => itemsData?.data ?? [], [itemsData]);
  const [id, setId] = useState<number | null>(null);
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [wh, setWh] = useState(ALL);
  const [fullscreen, setFullscreen] = useState(false);
  const [detail, setDetail] = useState<Trx | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const scannerRef = useRef<InstanceType<(typeof import("html5-qrcode"))["Html5Qrcode"]> | null>(
    null,
  );
  const scanHandledRef = useRef(false);

  const handleHardwareScan = useCallback(
    (code: string) => {
      if (!options.length) {
        toast.error("Data barang belum siap — coba lagi sesaat");
        return;
      }
      const found = findItemByCode(options, code);
      if (found) {
        setId(found.id);
        toast.success(`Terpilih: ${found.name}`);
      } else {
        toast.error(`Barang tidak ditemukan: ${code.trim()}`);
      }
    },
    [options],
  );

  // Scanner fisik (USB wedge): burst cepat + Enter → otomatis pilih barang.
  useBarcodeScanner({ onScan: handleHardwareScan, enabled: !scanOpen });
  const { data: docDetail, isLoading: docLoading } = useStockDocument(selectedId ?? undefined);
  const activeId = id ?? options[0]?.id;
  const whId = useMemo(
    () => (wh === ALL ? null : (warehouses?.data.find((w) => w.name === wh)?.id ?? null)),
    [warehouses, wh],
  );
  const isWarehouseReady = wh === ALL || !warehousesLoading;
  const whIdForFetch = isWarehouseReady ? whId : null;
  const activeIdForFetch = isWarehouseReady ? activeId : undefined;

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      const state = (scanner as unknown as { getState?: () => number }).getState?.();
      // Html5QrcodeScannerState.SCANNING = 2, NOT_STARTED = 1
      if (state === undefined || state === 2) {
        await scanner.stop();
      }
    } catch {
      // ignore: stop saat belum STARTED melempar, tidak perlu bubble
    }
    try {
      if (document.getElementById("kartu-stock-reader")) {
        await scanner.clear();
      }
    } catch {
      // clear pada DOM yang sudah ter-unmount aman diabaikan
    }
  }, []);

  useEffect(() => {
    if (!scanOpen) {
      void stopScanner();
      scanHandledRef.current = false;
      return;
    }
    let cancelled = false;
    scanHandledRef.current = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled || !scanOpen) return;
        const scanner = new Html5Qrcode("kartu-stock-reader", {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 400, height: 200 },
            aspectRatio: 1.33,
            disableFlip: false,
          },
          (decodedText) => {
            if (scanHandledRef.current) return;
            const found = findItemByCode(options, decodedText);
            if (found) {
              scanHandledRef.current = true;
              setId(found.id);
              toast.success(`Terpilih: ${found.name}`);
              setScanOpen(false);
            } else {
              toast.error(`Barang tidak ditemukan: ${decodedText.trim()}`);
            }
          },
          () => undefined,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          toast.error("Izin kamera ditolak — aktifkan di pengaturan browser");
        } else if (!msg.includes("not found")) {
          toast.error(`Gagal membuka kamera: ${msg}`);
        }
      }
    })();
    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [scanOpen, options, stopScanner]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Jangka panjang: kirim rentang tanggal ke server agar saldo_awal/saldo_akhir dan saldo baris di-recompute ledger (bukan hanya hide client)
  const cardFifo = useStockCard(
    activeIdForFetch,
    "FIFO",
    whIdForFetch,
    dateFrom || null,
    dateTo || null,
  );
  const cardAvg = useStockCard(
    activeIdForFetch,
    "Average",
    whIdForFetch,
    dateFrom || null,
    dateTo || null,
  );
  const cardMax = useStockCard(
    activeIdForFetch,
    "Maximum Cost",
    whIdForFetch,
    dateFrom || null,
    dateTo || null,
  );
  const card = method === "FIFO" ? cardFifo : method === "Average" ? cardAvg : cardMax;
  const methodCards: Record<ValuationMethod, typeof card> = {
    FIFO: cardFifo,
    Average: cardAvg,
    "Maximum Cost": cardMax,
  };

  const item = card.data?.data.item;
  const cardData = card.data?.data;
  const rows = useMemo(() => (cardData?.rows as CardRow[] | undefined) ?? [], [cardData]);
  const unit = item?.unit ?? "pcs";
  const saldoSekarang = item?.current_stock ?? cardData?.saldo_akhir ?? 0;
  const lastRow = rows[rows.length - 1];

  const totalMasuk = rows.reduce((a, r) => a + r.masuk, 0);
  const totalKeluar = rows.reduce((a, r) => a + r.keluar, 0);

  const tableRows = useMemo(() => rows.map((r, i) => ({ ...r, id: `${r.no}-${i}` })), [rows]);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [jenis, setJenis] = useState(ALL);
  const [pic, setPic] = useState(ALL);
  const hasActiveFilters = useMemo(
    () =>
      q !== "" || jenis !== ALL || pic !== ALL || wh !== ALL || dateFrom !== "" || dateTo !== "",
    [q, jenis, pic, wh, dateFrom, dateTo],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setJenis(ALL);
    setPic(ALL);
    setWh(ALL);
    setDateFrom("");
    setDateTo("");
  }, []);

  const jenisOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);
  const picOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.pic))), [rows]);

  // Jangka panjang: dateFrom/to sudah dikirim ke server (saldo di-recompute ledger), jadi filter tanggal client tidak perlu lagi — hanya q/jenis/pic client.
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
        if (pic !== ALL && r.pic !== pic) return false;
        return true;
      }),
    [tableRows, debouncedQ, jenis, pic],
  );

  const chart = useMemo(
    () =>
      rows.map((r) => ({
        date: formatDate(r.date).slice(0, 6),
        saldo: r.saldo,
        nilai: r.nilai,
      })),
    [rows],
  );

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
    if (r.document_id != null) {
      setSelectedId(r.document_id);
    } else if (item) {
      setDetail(toTrx(r, item));
    }
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
      render: (r) => {
        if (r.type === "Transfer Gudang" && r.source && r.destination) {
          return `${r.source} → ${r.destination}`;
        }
        return r.warehouse && r.destination && r.destination !== r.warehouse
          ? `${r.warehouse} → ${r.destination}`
          : (r.warehouse ?? "—");
      },
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
      sortable: false,
      render: (r) => (r.masuk ? `+${formatNumber(r.masuk)}` : "-"),
    },
    {
      key: "keluar",
      label: "Keluar",
      className: "text-right w-[100px] whitespace-nowrap text-destructive",
      sortable: false,
      render: (r) => (r.keluar ? `-${formatNumber(r.keluar)}` : "-"),
    },
    {
      key: "saldo",
      label: "Saldo",
      className: "text-right w-[100px] whitespace-nowrap font-semibold",
      sortable: false,
      render: (r) => `${formatNumber(r.saldo)} ${r.unit ?? ""}`,
    },
    {
      key: "nilai",
      label: `Nilai (${method})`,
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: false,
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
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Kartu Stock"
          description="Riwayat pergerakan stok per barang"
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
              <Button variant="outline" className="rounded-xl">
                <Printer className="h-4 w-4" /> Cetak
              </Button>
            </>
          }
        />

        <Panel title="Pilih Barang">
          <div className="flex gap-2">
            <FormCombobox
              value={activeId != null ? String(activeId) : ""}
              onValueChange={(v) => setId(Number(v))}
              options={options.map((o) => ({
                value: String(o.id),
                label: `${o.name} — ${o.sku}`,
                keywords:
                  `${o.name} ${o.sku} ${o.barcode ?? ""} ${o.internal_barcode ?? ""}`.trim(),
              }))}
              placeholder="Pilih barang…"
              searchPlaceholder="Cari nama, SKU, barcode…"
              loading={itemsLoading}
              className="max-w-md flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              aria-label="Scan barcode dengan kamera"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Scan dengan kamera atau scanner fisik untuk memilih otomatis
          </p>
        </Panel>

        <Dialog open={scanOpen} onOpenChange={setScanOpen}>
          <DialogContent className="max-w-md rounded-xl">
            <DialogHeader>
              <DialogTitle>Scan Barcode</DialogTitle>
              <DialogDescription>
                Arahkan barcode atau QR ke dalam kotak. Pastikan izin kamera diaktifkan dan gunakan
                HTTPS.
              </DialogDescription>
            </DialogHeader>
            <div
              id="kartu-stock-reader"
              className="min-h-[280px] overflow-hidden rounded-xl border border-border bg-black"
            />
            <p className="text-center text-xs text-muted-foreground">
              Mendukung EAN-13, Code 128, dan QR Code
            </p>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            loading={card.isLoading || card.isFetching}
            label="Saldo Sekarang"
            value={
              card.isLoading || card.isFetching
                ? "…"
                : `${formatNumber(Math.max(saldoSekarang, 0))} ${unit}`
            }
            icon={Boxes}
            tone="info"
          />
          <StatCard
            loading={card.isLoading || card.isFetching}
            label="Total Masuk"
            value={card.isLoading || card.isFetching ? "…" : `${formatNumber(totalMasuk)} ${unit}`}
            icon={ArrowDownLeft}
            tone="success"
          />
          <StatCard
            loading={card.isLoading || card.isFetching}
            label="Total Keluar"
            value={card.isLoading || card.isFetching ? "…" : `${formatNumber(totalKeluar)} ${unit}`}
            icon={ArrowUpRight}
            tone="warning"
          />
          <StatCard
            loading={card.isLoading || card.isFetching}
            label={`Nilai Akhir — ${valuationMethodLabels[method]}`}
            value={card.isLoading || card.isFetching ? "…" : formatIDRCompact(lastRow?.nilai ?? 0)}
            {...(card.isLoading || card.isFetching
              ? {}
              : {
                  valueTitle: formatIDR(lastRow?.nilai ?? 0),
                  hint: `${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit} × ${formatIDR(lastRow?.method_cost ?? 0)}`,
                })}
            icon={Wallet}
          />
        </div>

        <Panel
          title="Pergerakan Saldo Stok"
          description={`Satuan ${unit} · nilai memakai metode ${valuationMethodLabels[method]}`}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="ksArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={50} />
              <Tooltip
                formatter={(v: number, n) =>
                  n === "nilai" ? formatIDR(v) : `${formatNumber(v)} ${unit}`
                }
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="saldo"
                name="Saldo"
                stroke="var(--primary)"
                fill="url(#ksArea)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Nilai Stok per Metode"
          description="Perbandingan FIFO, Average, dan Estimasi Maksimum"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {valuationMethods.map((m) => {
              const c = methodCards[m];
              const cRows = c.data?.data.rows ?? [];
              const cLast = cRows[cRows.length - 1];
              const isLoading = c.isLoading || c.isFetching;
              return (
                <div
                  key={m}
                  className={cn(
                    "rounded-xl border p-4",
                    m === method ? "border-primary/40 bg-primary-soft" : "border-border",
                  )}
                >
                  <p className="text-xs font-semibold text-muted-foreground">
                    {valuationMethodLabels[m]}
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {isLoading ? "…" : formatIDR(cLast?.nilai ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isLoading ? "…" : `HPP ${formatIDR(cLast?.method_cost ?? 0)} / ${unit}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title={item?.name ?? "Memuat…"}
        description={`${item?.sku ?? ""} · saldo akhir ${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Keluar mode layar penuh" : "Tampilkan layar penuh"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? "Keluar" : "Fullscreen"}
          </Button>
        }
        className={cn(fullscreen && "fixed inset-0 z-40 flex flex-col !rounded-none !shadow-none")}
        bodyClassName={cn(fullscreen && "flex-1 overflow-auto")}
      >
        <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, referensi, catatan, PIC…"
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={jenis}
            onChange={setJenis}
            placeholder="Semua Jenis"
            options={jenisOptions}
            loading={card.isLoading}
          />
          <FilterSelect
            className="w-full"
            value={pic}
            onChange={setPic}
            placeholder="Semua PIC"
            options={picOptions}
            loading={card.isLoading}
          />
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <div className="flex w-full flex-col gap-1 col-span-full md:col-span-2 lg:col-span-2 xl:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">
              Filter Periode Transaksi
            </label>
            <div className="flex w-full items-center justify-start gap-1 rounded-xl border border-input bg-card p-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-full min-w-0 flex-1 rounded-lg border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 sm:w-[140px] sm:flex-none"
                aria-label="Dari tanggal"
              />
              <span
                className="flex shrink-0 items-center justify-center px-1 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                –
              </span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-full min-w-0 flex-1 rounded-lg border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 sm:w-[140px] sm:flex-none"
                aria-label="Sampai tanggal"
              />
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-end">
            <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
          </div>
        </div>
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
                <Pill tone={typeTone(r.type)}>
                  {r.masuk ? `+${formatNumber(r.masuk)}` : `-${formatNumber(r.keluar)}`}{" "}
                  {r.unit ?? ""}
                </Pill>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                <p>Jenis: {r.type}</p>
                <p>
                  Gudang:{" "}
                  {r.type === "Transfer Gudang" && r.source && r.destination
                    ? `${r.source} → ${r.destination}`
                    : r.warehouse && r.destination && r.destination !== r.warehouse
                      ? `${r.warehouse} → ${r.destination}`
                      : (r.warehouse ?? "—")}
                </p>
                <p>
                  Saldo: {formatNumber(r.saldo)} {r.unit ?? ""}
                </p>
                <p>
                  Nilai ({method}): {formatIDR(r.nilai)}
                </p>
                <p>PIC: {r.pic}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">Catatan: {r.note}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                onClick={() => openDetail(r)}
              >
                Lihat Detail
              </Button>
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
