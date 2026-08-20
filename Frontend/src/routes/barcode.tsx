import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Download, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormCombobox, type ComboboxOption } from "@/components/wms/form-combobox";
import { useItems } from "@/hooks/use-master";
import { formatIDR } from "@/lib/wms-data";
import { cn } from "@/lib/utils";
import {
  LABEL_SIZES,
  MAX_LABELS,
  buildCodeSvg,
  buildPrintHtml,
  buildSheetSvg,
  computeSheetLayout,
  downloadSvg,
  encodeItem,
  printHtml,
  type BarcodeKind,
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
  const items = useMemo(() => itemsQ.data?.data ?? [], [itemsQ.data?.data]);
  const { sku } = useSearch({ from: "/barcode" });

  const [kind, setKind] = useState<BarcodeKind>("Barcode");
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

  useEffect(() => {
    if (sku && !seeded.current && items.length > 0) {
      const it = items.find((i) => i.sku === sku);
      if (it) addRow(it.id);
      seeded.current = true;
    }
  }, [sku, items, addRow]);

  const previews = useMemo(
    () =>
      rows
        .map((r) => {
          const it = items.find((i) => i.id === r.itemId);
          if (!it) return null;
          let svg: string;
          try {
            svg = buildCodeSvg(encodeItem(it), kind, { codeHeightMm: CODE_HEIGHT[size] });
          } catch {
            return { item: it, error: true, key: r.id, qty: r.qty };
          }
          return { item: it, svg, key: r.id, qty: r.qty, value: encodeItem(it) };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [rows, items, kind, size],
  );

  const buildLabels = useCallback((): { labels: PrintLabel[]; ok: boolean } => {
    const labels: PrintLabel[] = [];
    for (const r of rows) {
      const it = items.find((i) => i.id === r.itemId);
      if (!it) continue;
      let svg: string;
      try {
        svg = buildCodeSvg(encodeItem(it), kind, { codeHeightMm: CODE_HEIGHT[size] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal generate kode");
        return { labels, ok: false };
      }
      const meta = `${it.sku} · ${formatIDR(it.price)}`;
      const remaining = MAX_LABELS - labels.length;
      for (let k = 0; k < Math.min(r.qty, remaining); k++) {
        labels.push({ svg, name: it.name, meta, kind, sku: it.sku });
      }
      if (labels.length >= MAX_LABELS) break;
    }
    return { labels, ok: true };
  }, [rows, items, kind, size]);

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

  const handleDownload = () => {
    if (rows.length === 0) {
      toast.error("Tambah barang terlebih dahulu");
      return;
    }
    const { labels, ok } = buildLabels();
    if (!ok || labels.length === 0) return;
    const sheet = buildSheetSvg({ size, labels });
    const filename =
      labels.length === 1 && labels[0]?.sku ? `label-${labels[0].sku}.svg` : `label-${size}.svg`;
    downloadSvg(sheet, filename);
    toast.success(`Label diunduh sebagai ${filename}`);
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
              disabled={rows.length === 0}
            >
              <Download className="h-4 w-4" /> Download
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
                        className="h-9"
                      />
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
          description={`${kind} · ${size === "A4" ? "A4 Penuh" : size} · ${total} label`}
        >
          {itemsQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : previews.length === 0 ? (
            <EmptyState
              title="Belum ada barang"
              description="Pilih barang dan tentukan jumlahnya di panel Pengaturan untuk melihat preview label."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {previews.map((p) => (
                <div
                  key={p.key}
                  className={cn(
                    "rounded-xl border border-dashed border-border bg-card p-4 text-center",
                    size === "A4" && "sm:col-span-2",
                  )}
                >
                  {"svg" in p ? (
                    <div
                      className="mx-auto max-w-64 [&_svg]:h-auto [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: p.svg }}
                    />
                  ) : (
                    <p className="py-6 text-xs text-danger">
                      Barang ini belum punya barcode/SKU yang valid.
                    </p>
                  )}
                  <p className="mt-2 truncate text-xs font-semibold">{p.item.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{p.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.qty} label · {formatIDR(p.item.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
