import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/wms/kit";
import { cn } from "@/lib/utils";
import { items } from "@/lib/wms-data";

export const Route = createFileRoute("/barcode")({
  head: () => ({
    meta: [
      { title: "Barcode & QR Code — KelolaGudang" },
      { name: "description", content: "Generate barcode, QR code, dan cetak label dalam berbagai ukuran." },
      { property: "og:title", content: "Barcode & QR Code — KelolaGudang" },
      { property: "og:description", content: "Cetak label barang dengan cepat." },
    ],
  }),
  component: BarcodePage,
});

const sizes = ["30x20", "50x30", "100x50", "A4 Multiple"];

function BarcodePage() {
  const [mode, setMode] = useState<"Barcode" | "QR Code">("Barcode");
  const [size, setSize] = useState("50x30");
  const [sku, setSku] = useState(items[0]!.name);
  const item = items.find((i) => i.name === sku) ?? items[0]!;

  return (
    <>
      <PageHeader
        title="Barcode & QR Code"
        description="Generate dan cetak label barang"
        actions={
          <>
            <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Label diunduh")}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button className="rounded-xl" onClick={() => toast.success("Label dikirim ke printer")}>
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
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Barang</Label>
              <FilterSelect
                value={sku}
                onChange={setSku}
                placeholder="Pilih Barang"
                options={items.slice(0, 40).map((i) => i.name)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ukuran Label</Label>
              <div className="grid grid-cols-2 gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                      size === s ? "border-primary/40 bg-primary-soft text-primary" : "border-border",
                    )}
                  >
                    {s} {s !== "A4 Multiple" && "mm"}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full rounded-xl" onClick={() => toast.success(`${mode} berhasil digenerate`)}>
              <QrCode className="h-4 w-4" /> Generate
            </Button>
          </div>
        </Panel>

        <Panel title="Preview Label" description={`${mode} · ${size}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: size === "A4 Multiple" ? 6 : 2 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
                <p className="truncate text-xs font-semibold">{item.name}</p>
                {mode === "Barcode" ? (
                  <div className="mt-3 flex h-14 items-end justify-center gap-[2px]">
                    {item.barcode.split("").flatMap((ch, x) =>
                      Array.from({ length: 3 }, (_, j) => (
                        <span
                          key={`${x}-${j}`}
                          className="bg-foreground"
                          style={{ width: ((Number(ch) + j) % 3) + 1, height: `${55 + ((Number(ch) * 9 + j * 7) % 45)}%` }}
                        />
                      )),
                    )}
                  </div>
                ) : (
                  <div className="mx-auto mt-3 grid w-24 grid-cols-10 gap-[2px]">
                    {Array.from({ length: 100 }, (_, k) => (
                      <span
                        key={k}
                        className={(k * 31 + item.barcode.length) % 4 !== 0 ? "aspect-square bg-foreground" : "aspect-square"}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">{item.barcode}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}