import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Printer, Pencil, Paperclip, QrCode } from "lucide-react";
import { PageHeader, Panel, Pill, ItemThumb, EmptyState } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { buildCodeSvg, buildPrintHtml, printHtml, type BarcodeKind } from "@/lib/barcode-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ItemFormDialog } from "@/components/wms/master-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatIDR, formatNumber, warehouses } from "@/lib/wms-data";
import { useItem } from "@/hooks/use-master";
import { useStockCard } from "@/hooks/use-persediaan";
import { useAuth } from "@/hooks/use-auth";
import type { ItemApi } from "@/lib/master-types";

export const Route = createFileRoute("/master/barang/$id")({
  head: () => ({
    meta: [{ title: "Detail Barang — KelolaGudang" }],
  }),
  component: DetailBarang,
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/**
 * Satu slot kode milik barang: SKU, Barcode Produk, Barcode Internal, QR Code.
 * Slot kosong TIDAK di-generate otomatis — tampilkan status + tombol
 * redirect ke halaman Barcode. Slot terisi memakai SVG scannable asli
 * (buildCodeSvg), bukan visual dekoratif.
 */
function CodeSlot({
  label,
  value,
  kind,
  sku,
  name,
}: {
  label: string;
  value: string | null;
  kind: BarcodeKind;
  sku: string;
  name: string;
}) {
  if (!value) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">Belum ada {label.toLowerCase()}</p>
        <Button variant="outline" size="sm" className="mt-3 rounded-lg" asChild>
          <Link to="/barcode" search={{ sku }}>
            {kind === "QR Code" ? <QrCode className="h-4 w-4" /> : <Printer className="h-4 w-4" />}{" "}
            Buat di Halaman Barcode
          </Link>
        </Button>
      </div>
    );
  }
  let svg: string;
  try {
    svg = buildCodeSvg(value, kind);
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium text-destructive">Kode tidak valid untuk {kind}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{value}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      <div
        className="mx-auto max-w-64 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-2 font-mono text-xs text-muted-foreground">{value}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 rounded-lg"
        onClick={() =>
          printHtml(
            buildPrintHtml({
              size: "50x30",
              labels: [{ svg, name, meta: value, kind, sku }],
            }),
          )
        }
      >
        <Printer className="h-4 w-4" /> Cetak
      </Button>
    </div>
  );
}

const stockStatus = (it: { stock: number; min: number; max: number | null }) =>
  it.stock === 0
    ? { label: "Habis", tone: "danger" as const }
    : it.stock <= it.min
      ? { label: "Menipis", tone: "warning" as const }
      : it.max != null && it.stock >= it.max
        ? { label: "Overstock", tone: "info" as const }
        : { label: "Normal", tone: "success" as const };

const hueFor = (id: number) => (id * 137) % 360;

function DetailBarang() {
  const { id } = Route.useParams();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Master Data", "Tulis");
  const { data, isLoading } = useItem(Number(id));
  const [editing, setEditing] = useState<ItemApi | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const item = data?.data;
  const { data: cardData, isLoading: cardLoading } = useStockCard(item?.id, "FIFO");

  if (isLoading) {
    return (
      <Panel title="Memuat..." description="Mengambil data barang">
        <EmptyState title="Memuat..." />
      </Panel>
    );
  }

  if (!item) {
    return (
      <>
        <Link
          to="/master/barang"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Master Barang
        </Link>
        <EmptyState
          title="Barang tidak ditemukan"
          description="Data barang tidak tersedia di server."
        />
      </>
    );
  }

  const card = cardData?.data.rows ?? [];
  const s = stockStatus(item);
  const categoryLabel = `${item.category ?? "—"}${item.subCategory ? ` / ${item.subCategory}` : ""}`;

  return (
    <>
      <Link
        to="/master/barang"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke Master Barang
      </Link>

      <PageHeader
        title={item.name}
        description={`${item.sku} · ${item.category ?? "tanpa kategori"}`}
        actions={
          <>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/barcode" search={{ sku: item.sku }}>
                <Printer className="h-4 w-4" /> Cetak Label
              </Link>
            </Button>
            {canWrite && (
              <Button
                className="rounded-xl"
                onClick={() => {
                  setEditing(item);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Edit Barang
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel bodyClassName="p-4">
            <div
              className="grid aspect-square w-full place-items-center rounded-xl"
              style={{
                background: `linear-gradient(135deg, oklch(0.94 0.06 ${hueFor(item.id)}), oklch(0.86 0.09 ${hueFor(item.id) + 30}))`,
              }}
            >
              <ItemThumb hue={hueFor(item.id)} label={item.name} size={110} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Stock" value={formatNumber(item.stock)} />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Pill tone={s.tone}>{s.label}</Pill>
              </div>
              <Field label="Harga Pokok" value={formatIDR(item.cost)} />
              <Field label="Harga Jual" value={formatIDR(item.price)} />
            </div>
          </Panel>
        </div>

        <Panel bodyClassName="p-0">
          <Tabs defaultValue="info">
            <div className="overflow-x-auto border-b border-border px-3 pt-3">
              <TabsList className="rounded-xl">
                <TabsTrigger value="info">Informasi</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
                <TabsTrigger value="kartu">Kartu Stock</TabsTrigger>
                <TabsTrigger value="barcode">Barcode</TabsTrigger>
                <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
                <TabsTrigger value="lampiran">Lampiran</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="info" className="m-0 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="SKU" value={item.sku} />
              <Field label="Barcode" value={item.barcode ?? "—"} />
              <Field label="Barcode Internal" value={item.internal_barcode ?? "—"} />
              <Field label="Nama Barang" value={item.name} />
              <Field label="Merk" value={item.brand ?? "—"} />
              <Field label="Kategori" value={categoryLabel} />
              <Field label="Gudang" value={item.warehouse ?? "—"} />
              <Field label="Rak" value={item.rack ?? "—"} />
              <Field label="Bin" value={item.bin ?? "—"} />
              <Field label="Supplier" value={item.supplier ?? "—"} />
              <Field label="Satuan" value={item.unit ?? "—"} />
              <Field label="Berat" value={item.weight != null ? `${item.weight} kg` : "—"} />
              <Field label="Dimensi" value={item.dimension ?? "—"} />
              <Field label="Minimum Stock" value={formatNumber(item.min)} />
              <Field
                label="Maximum Stock"
                value={item.max != null ? formatNumber(item.max) : "—"}
              />
              <Field label="Lead Time" value={`${item.leadTime} hari`} />
            </TabsContent>

            <TabsContent value="stock" className="m-0 space-y-3 p-5">
              {warehouses.slice(0, 5).map((w, i) => (
                <div
                  key={w.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Lokasi tersedia setelah ITEM_STOCK
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatNumber(Math.max(0, Math.round(item.stock / (i + 2))))}
                  </p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="kartu" className="m-0 p-5">
              {cardLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : card.length === 0 ? (
                <EmptyState
                  title="Belum ada mutasi"
                  description="Tidak ada pergerakan stok untuk barang ini."
                />
              ) : (
                <Accordion type="single" collapsible className="space-y-2">
                  {[...card].reverse().map((row, i) => (
                    <AccordionItem
                      key={i}
                      value={`r${i}`}
                      className="rounded-xl border border-border px-4"
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pr-2">
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-medium">{row.no}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(row.date)}</p>
                          </div>
                          <Pill tone={row.masuk ? "success" : "warning"}>
                            {row.masuk ? `+${row.masuk}` : `-${row.keluar}`}
                          </Pill>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
                        <Field label="Jenis" value={row.type} />
                        <Field label="Saldo" value={formatNumber(row.saldo)} />
                        <Field label="PIC" value={row.pic} />
                        <Field label="Catatan" value={row.note} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>

            <TabsContent value="barcode" className="m-0 grid gap-4 p-5 sm:grid-cols-2">
              <CodeSlot
                label="SKU"
                value={item.sku}
                kind="Barcode"
                sku={item.sku}
                name={item.name}
              />
              <CodeSlot
                label="Barcode Produk"
                value={item.barcode}
                kind="Barcode"
                sku={item.sku}
                name={item.name}
              />
              <CodeSlot
                label="Barcode Internal"
                value={item.internal_barcode}
                kind="Barcode"
                sku={item.sku}
                name={item.name}
              />
              <CodeSlot
                label="QR Code"
                value={item.barcode ?? item.internal_barcode}
                kind="QR Code"
                sku={item.sku}
                name={item.name}
              />
            </TabsContent>

            <TabsContent value="riwayat" className="m-0 p-5">
              {cardLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-xl" />
                  ))}
                </div>
              ) : card.length === 0 ? (
                <EmptyState
                  title="Belum ada riwayat"
                  description="Riwayat pergerakan stok akan tampil di sini."
                />
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {card
                    .slice(-8)
                    .reverse()
                    .map((row, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                        <p className="text-sm font-medium">
                          {row.type} · {row.no}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(row.date)} — {row.pic} — saldo {formatNumber(row.saldo)}
                        </p>
                      </li>
                    ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="lampiran" className="m-0 space-y-3 p-5">
              {["Spesifikasi-Teknis.pdf", "Sertifikat-Mutu.pdf", "Foto-Kemasan.jpg"].map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{f}</span>
                  <Button size="sm" variant="ghost" className="ml-auto rounded-lg">
                    Unduh
                  </Button>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </Panel>
      </div>

      <ItemFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}
