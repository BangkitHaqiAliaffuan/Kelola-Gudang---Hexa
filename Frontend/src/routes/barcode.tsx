import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Download, Minus, Plus, Printer, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormCombobox, type ComboboxOption } from "@/components/wms/form-combobox";
import { useWmsScanner, type ScanMatch } from "@/hooks/use-wms-scanner";
import { ScanDisambiguasiDialog } from "@/components/wms/scan-disambiguasi-dialog";
import { ItemFormDialog } from "@/components/wms/master-forms";
import { useItems, useUpdateItem, type ItemPayload } from "@/hooks/use-master";
import { useAuth } from "@/hooks/use-auth";
import type { ItemApi } from "@/lib/master-types";
import { formatIDR } from "@/lib/wms-data";
import { cn } from "@/lib/utils";
import {
  LABEL_SIZES,
  MAX_LABELS,
  CODE_SOURCE_LABEL,
  buildCodeSvg,
  buildPrintHtml,
  computeSheetLayout,
  downloadLabelsAsPngOrZip,
  encodeItemWithSource,
  normalizeCode,
  printHtml,
  type BarcodeKind,
  type CodeSource,
  type LabelSize,
  type PrintLabel,
} from "@/lib/barcode-label";

const barcodeSearchSchema = z.object({
  sku: z.string().optional(),
});

export const Route = createFileRoute("/barcode")({
  validateSearch: barcodeSearchSchema,
  head: () => ({
    meta: [
      { title: "Barcode & QR Code — KelolaGudang" },
      {
        name: "description",
        content: "Generate barcode, QR code, dan cetak label dalam berbagai ukuran.",
      },
      { property: "og:title", content: "Barcode & QR Code — KelolaGudang" },
      { property: "og:description", content: "Cetak label barang dengan cepat." },
    ],
  }),
  component: BarcodePage,
});

type Row = { id: number; itemId: number; qty: number };

/** Tinggi bar barcode (mm) agar muat beserta nama + SKU/harga di label. */
const CODE_HEIGHT: Record<LabelSize, number> = {
  "30x20": 8,
  "50x30": 14,
  "100x50": 22,
  A4: 60,
};

function BarcodePage() {
  const itemsQ = useItems();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Master Data", "Tulis");
  const updateItem = useUpdateItem();
  const items = useMemo(() => itemsQ.data?.data ?? [], [itemsQ.data?.data]);
  const { sku } = useSearch({ from: "/barcode" });

  const [kind, setKind] = useState<BarcodeKind>("Barcode");
  const [source, setSource] = useState<CodeSource>("internal");
  const [size, setSize] = useState<LabelSize>("50x30");
  const [rows, setRows] = useState<Row[]>([]);

  const nextRowId = useRef(1);
  const seeded = useRef(false);

  const total = rows.reduce((s, r) => s + r.qty, 0);
  const { perSheet } = computeSheetLayout(size);

  const options: ComboboxOption[] = useMemo(
    () =>
      items.map((it) => ({
        value: String(it.id),
        label: it.name,
        keywords: `${it.sku} ${it.barcode ?? ""} ${it.internal_barcode ?? ""}`.trim(),
      })),
    [items],
  );

  const addRow = useCallback((itemId: number) => {
    setRows((prev) => {
      if (prev.some((r) => r.itemId === itemId)) return prev;
      const used = prev.reduce((s, r) => s + r.qty, 0);
      if (used + 1 > MAX_LABELS) {
        toast.error(`Maksimal ${MAX_LABELS} label per cetakan`);
        return prev;
      }
      return [...prev, { id: nextRowId.current++, itemId, qty: 1 }];
    });
  }, []);

  const updateQty = useCallback((id: number, qty: number) => {
    setRows((prev) => {
      const others = prev.filter((r) => r.id !== id).reduce((s, r) => s + r.qty, 0);
      const clamped = Math.min(Math.max(qty, 1), Math.max(MAX_LABELS - others, 1));
      return prev.map((r) => (r.id === id ? { ...r, qty: clamped } : r));
    });
  }, []);

  const removeRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const [scanTarget, setScanTarget] = useState<number | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [ambiguous, setAmbiguous] = useState<{ code: string; matches: ScanMatch[] } | null>(null);
  // Kode hasil scan yang belum terdaftar di master → tawar buat barang baru.
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const pendingBarcode = useRef<string | null>(null);
  const { scanOpen, setScanOpen, readerId, resolveScan } = useWmsScanner({
    items: items as never,
    onPick: (item) => {
      const pickedId = (item as { id: number }).id;
      if (scanTarget != null) {
        setRows((prev) => {
          if (prev.some((r) => r.itemId === pickedId)) return prev;
          if (!prev.some((r) => r.id === scanTarget)) {
            return prev;
          }
          return prev.map((r) => (r.id === scanTarget ? { ...r, itemId: pickedId } : r));
        });
      } else {
        addRow(pickedId);
      }
    },
    onAmbiguous: (code, matches) => setAmbiguous({ code, matches }),
    onUnknown: (code) => {
      if (!canWrite) {
        toast.error(`Barang tidak ditemukan: ${code} (perlu akses Tulis Master Data)`);
        return;
      }
      setUnknownCode(code);
    },
  });

  useEffect(() => {
    if (sku && !seeded.current && items.length > 0) {
      const it = items.find((i) => i.sku === sku);
      if (it) addRow(it.id);
      seeded.current = true;
    }
  }, [sku, items, addRow]);

  // Setelah barang baru tersimpan (invalidasi items), masukkan otomatis ke
  // daftar label. Aman dari batal: tanpa item cocok, tidak ada yang terjadi.
  useEffect(() => {
    const pending = pendingBarcode.current;
    if (!pending || createOpen || items.length === 0) return;
    const it = items.find((i) => normalizeCode(i.barcode ?? "") === normalizeCode(pending));
    if (it) {
      pendingBarcode.current = null;
      addRow(it.id);
      toast.success(`${it.name} ditambahkan ke daftar label`);
    }
  }, [items, createOpen, addRow]);

  /** Bangun label tanpa efek samping (tanpa toast) — dipakai print, unduh, dan preview. */
  const tryBuildLabels = useCallback((): { labels: PrintLabel[]; failedIds: number[] } => {
    const labels: PrintLabel[] = [];
    const failedIds: number[] = [];
    for (const r of rows) {
      const it = items.find((i) => i.id === r.itemId);
      if (!it) continue;
      let svg: string;
      try {
        svg = buildCodeSvg(encodeItemWithSource(it, source), kind, {
          codeHeightMm: CODE_HEIGHT[size],
        });
      } catch {
        if (!failedIds.includes(it.id)) failedIds.push(it.id);
        continue;
      }
      const meta = `${it.sku} · ${formatIDR(it.price)}`;
      const remaining = MAX_LABELS - labels.length;
      for (let k = 0; k < Math.min(r.qty, remaining); k++) {
        labels.push({ svg, name: it.name, meta, kind, sku: it.sku });
      }
      if (labels.length >= MAX_LABELS) break;
    }
    return { labels, failedIds };
  }, [rows, items, kind, size, source]);

  /** Preview WYSIWYG: string HTML yang PERSIS SAMA dengan yang dikirim ke printer. */
  const preview = useMemo(() => {
    if (rows.length === 0) return null;
    const { labels, failedIds } = tryBuildLabels();
    const failed = failedIds
      .map((id) => items.find((i) => i.id === id))
      .filter((x): x is ItemApi => x !== undefined);
    if (labels.length === 0) return { html: "", failed };
    return { html: buildPrintHtml({ size, labels }), failed };
  }, [rows, tryBuildLabels, items, size]);

  /** Barang yang nilainya bisa ditetapkan sebagai barcode produk (satu klik).
   * Kandidat = barcode produk bila terisi, jika tidak fallback ke SKU
   * (legal: barcode tidak unique, max 30 — SKU selalu memenuhi keduanya).
   * Barang tanpa kandidat tetap tampil jujur sebagai gagal cetak (A4)
   * sekaligus mendapat tombol penetapan (B3). */
  const assignable = useMemo(() => {
    if (!canWrite || source !== "produk") return [];
    const seen = new Set<number>();
    const out: { item: ItemApi; value: string; fromSku: boolean }[] = [];
    for (const r of rows) {
      const it = items.find((i) => i.id === r.itemId);
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      const targetValue = it.barcode || it.sku;
      if (targetValue && it.barcode !== targetValue) {
        out.push({ item: it, value: targetValue, fromSku: !it.barcode });
      }
    }
    return out;
  }, [rows, items, source, canWrite]);

  /** ID barang yang baru saja ditetapkan — tombolnya menjadi "Sudah Tersimpan". */
  const [assignedIds, setAssignedIds] = useState<number[]>([]);

  /** QR di label 30x20 hanya ±12mm — peringatkan keterbacaan, tetap boleh cetak. */
  const qrTooSmall = kind === "QR Code" && size === "30x20";

  const buildLabels = useCallback((): { labels: PrintLabel[]; ok: boolean } => {
    const { labels, failedIds } = tryBuildLabels();
    if (failedIds.length > 0) {
      toast.error("Sebagian barang belum punya barcode/SKU yang valid");
      return { labels, ok: false };
    }
    return { labels, ok: true };
  }, [tryBuildLabels]);

  const [downloading, setDownloading] = useState(false);

  // Tetapkan nilai render sebagai barcode produk (satu-satunya kolom kode
  // yang boleh diubah; internal_barcode dikunci API). Detail barang ikut
  // ter-update via invalidasi items.
  const assignBarcode = async (itemId: number, value: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    if (it.barcode === value) return;
    const payload: ItemPayload = {
      sku: it.sku,
      barcode: value,
      name: it.name,
      category_id: it.category_id,
      ...(it.sub_category_id != null ? { sub_category_id: it.sub_category_id } : {}),
      ...(it.brand_id != null ? { brand_id: it.brand_id } : {}),
      ...(it.unit_id != null ? { unit_id: it.unit_id } : {}),
      ...(it.default_warehouse_id != null ? { default_warehouse_id: it.default_warehouse_id } : {}),
      ...(it.default_rack_id != null ? { default_rack_id: it.default_rack_id } : {}),
      ...(it.default_bin_id != null ? { default_bin_id: it.default_bin_id } : {}),
      ...(it.preferred_supplier_id != null
        ? { preferred_supplier_id: it.preferred_supplier_id }
        : {}),
      cost: it.cost,
      price: it.price,
      min_stock: it.min,
      ...(it.max != null ? { max_stock: it.max } : {}),
      lead_time: it.leadTime,
      ...(it.weight != null ? { weight: it.weight } : {}),
      dimension: it.dimension,
      status: it.status,
    };
    try {
      await updateItem.mutateAsync({ id: it.id, ...payload });
      setAssignedIds((prev) => (prev.includes(it.id) ? prev : [...prev, it.id]));
      toast.success(`Barcode ${value} tersimpan ke ${it.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePrint = () => {
    if (rows.length === 0) {
      toast.error("Tambah barang terlebih dahulu");
      return;
    }
    const { labels, ok } = buildLabels();
    if (!ok || labels.length === 0) return;
    printHtml(buildPrintHtml({ size, labels }));
    toast.success(`${labels.length} label dikirim ke printer`);
  };

  const handleDownload = async () => {
    if (rows.length === 0) {
      toast.error("Tambah barang terlebih dahulu");
      return;
    }
    const { labels, ok } = buildLabels();
    if (!ok || labels.length === 0) return;
    setDownloading(true);
    const toastId = toast.loading(
      labels.length === 1 ? "Menyiapkan PNG..." : `Menyiapkan ${labels.length} PNG (ZIP)...`,
    );
    try {
      const filename = await downloadLabelsAsPngOrZip(labels, size);
      toast.success(`Label diunduh sebagai ${filename}`, { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh label", { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Barcode & QR Code"
        description="Generate dan cetak label barang"
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleDownload}
              disabled={rows.length === 0 || downloading}
            >
              <Download className="h-4 w-4" /> {downloading ? "Menyiapkan..." : "Download PNG"}
            </Button>
            <Button className="rounded-xl" onClick={handlePrint} disabled={rows.length === 0}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Panel title="Pengaturan Label">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Jenis Kode</Label>
              <div className="flex rounded-xl border border-border bg-card p-1">
                {(["Barcode", "QR Code"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setKind(m)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      kind === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Sumber Nilai</Label>
              <div className="flex rounded-xl border border-border bg-card p-1">
                {(["internal", "produk", "sku"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      source === s ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {CODE_SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Nilai yang di-encode ke label. Barcode produk tidak perlu dicetak ulang — sudah
                menempel di kemasan supplier.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Ukuran Label</Label>
              <div className="grid grid-cols-2 gap-2">
                {LABEL_SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSize(s.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                      size === s.id
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-border",
                    )}
                  >
                    {s.label} · {computeSheetLayout(s.id).perSheet}/lembar
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Barang</Label>
                <span className="text-xs text-muted-foreground">{total} label</span>
              </div>
              <div className="space-y-2">
                {rows.map((r) => {
                  const it = items.find((i) => i.id === r.itemId);
                  return (
                    <div key={r.id} className="space-y-2 rounded-xl border border-border p-2.5">
                      <div className="flex gap-1">
                        <FormCombobox
                          value={it ? String(it.id) : ""}
                          onValueChange={(v) => {
                            const itemId = Number(v);
                            if (itemId) addRow(itemId);
                            else removeRow(r.id);
                          }}
                          options={options}
                          placeholder="Pilih barang / scan barcode"
                          searchPlaceholder="Cari nama, SKU, barcode..."
                          className="h-9 flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-lg"
                          aria-label="Scan barcode"
                          onClick={() => {
                            setScanTarget(r.id);
                            setScanOpen(true);
                          }}
                        >
                          <ScanLine className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-lg border border-border">
                          <button
                            type="button"
                            aria-label="Kurangi jumlah"
                            className="grid h-8 w-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-muted"
                            onClick={() => updateQty(r.id, r.qty - 1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold tabular-nums">
                            {r.qty}
                          </span>
                          <button
                            type="button"
                            aria-label="Tambah jumlah"
                            className="grid h-8 w-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-muted"
                            onClick={() => updateQty(r.id, r.qty + 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg text-danger"
                          onClick={() => removeRow(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Hapus
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                disabled={total >= MAX_LABELS}
                onClick={() => {
                  setRows((prev) => {
                    if (prev.length + 1 > MAX_LABELS) return prev;
                    return [...prev, { id: nextRowId.current++, itemId: 0, qty: 1 }];
                  });
                }}
              >
                <Plus className="h-4 w-4" /> Tambah Barang
              </Button>
              {total >= MAX_LABELS && (
                <p className="text-xs text-warning">
                  Batas {MAX_LABELS} label per cetakan tercapai.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Preview Label"
          description={`${kind} · ${size === "A4" ? "A4 Penuh" : size} · ${total} label · persis hasil cetak`}
        >
          {itemsQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : preview === null ? (
            <EmptyState
              title="Belum ada barang"
              description="Pilih barang dan tentukan jumlahnya di panel Pengaturan untuk melihat preview label."
            />
          ) : (
            <div className="space-y-3">
              {qrTooSmall && (
                <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                  QR pada label 30×20 hanya ±12 mm dan mungkin sulit dipindai — disarankan ukuran
                  ≥50×30.
                </p>
              )}
              {preview.failed.map((it) => (
                <p
                  key={it.id}
                  className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  {it.name} — belum punya barcode/SKU yang valid, tidak ikut tercetak.
                </p>
              ))}
              {assignable.length > 0 && (
                <div className="space-y-1.5">
                  {assignable.map(({ item, value, fromSku }) => {
                    const done = assignedIds.includes(item.id) || item.barcode === value;
                    return (
                      <Button
                        key={item.id}
                        variant="outline"
                        size="sm"
                        className="w-full rounded-lg"
                        disabled={updateItem.isPending || done}
                        onClick={() => void assignBarcode(item.id, value)}
                      >
                        {done
                          ? "Sudah Tersimpan"
                          : fromSku
                            ? `Tetapkan SKU ${item.sku} sebagai Barcode Produk`
                            : `Tetapkan ${value} ke ${item.name}`}
                      </Button>
                    );
                  })}
                </div>
              )}
              {preview.html !== "" && (
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <iframe
                    title="Preview label persis hasil cetak"
                    srcDoc={preview.html}
                    sandbox=""
                    className="h-[560px] w-full border-0"
                    style={{ zoom: 0.6 }}
                  />
                  <p className="border-t border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                    Preview di atas adalah dokumen yang persis dikirim ke printer (diperkecil 60%).
                    Garis putus-putus hanya panduan potong di layar.
                  </p>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={unknownCode !== null} onOpenChange={(o) => !o && setUnknownCode(null)}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Barcode belum terdaftar</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{unknownCode}</span> belum ada di master barang. Buat data
              barang baru dengan barcode produk ini?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setUnknownCode(null)}>
              Batal
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                pendingBarcode.current = unknownCode;
                setUnknownCode(null);
                setCreateOpen(true);
              }}
            >
              Buat Barang Baru
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ItemFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={null}
        prefillBarcode={pendingBarcode.current ?? undefined}
      />
      <ScanDisambiguasiDialog
        open={ambiguous !== null}
        code={ambiguous?.code}
        matches={ambiguous?.matches ?? []}
        onClose={() => setAmbiguous(null)}
        onPick={(item) => {
          const pickedId = Number(item.id);
          if (scanTarget != null) {
            setRows((prev) => {
              if (prev.some((r) => r.itemId === pickedId)) return prev;
              if (!prev.some((r) => r.id === scanTarget)) return prev;
              return prev.map((r) => (r.id === scanTarget ? { ...r, itemId: pickedId } : r));
            });
          } else {
            addRow(pickedId);
          }
          setAmbiguous(null);
        }}
      />
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>Arahkan barcode atau QR ke dalam kotak.</DialogDescription>
          </DialogHeader>
          <div
            id={readerId}
            className="min-h-[280px] overflow-hidden rounded-xl border border-border bg-black"
          />
          <p className="text-center text-xs text-muted-foreground">
            Mendukung EAN-13, Code 128, dan QR. Bila kamera sulit membaca (mis. scan dari layar),
            perbesar gambar, naikkan kecerahan, dan hindari pantulan — atau ketik kodenya di bawah.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manualCode.trim();
              if (!code) return;
              if (resolveScan(code)) setScanOpen(false);
              setManualCode("");
            }}
          >
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Ketik / tempel kode barcode..."
              className="h-9 flex-1 rounded-lg font-mono"
              aria-label="Ketik kode barcode manual"
            />
            <Button type="submit" variant="outline" className="h-9 shrink-0 rounded-lg">
              Proses
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
