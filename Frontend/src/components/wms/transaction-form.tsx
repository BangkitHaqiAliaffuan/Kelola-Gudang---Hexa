import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Barcode, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel } from "./kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  customers,
  departments,
  formatIDR,
  items,
  projects,
  suppliers,
  warehouses,
  workOrders,
  type Trx,
} from "@/lib/wms-data";

export type FormVariant = "masuk" | "keluar" | "transfer";

type Line = { id: string; barcode: string; name: string; qty: number; unit: string; price: number };

function newLine(i: number): Line {
  const it = items[(i * 37) % items.length]!;
  return {
    id: `L${i}`,
    barcode: it.barcode,
    name: it.name,
    qty: 10 + i * 5,
    unit: it.unit,
    price: it.cost,
  };
}

function linesFrom(trx: Trx): Line[] {
  return trx.lines.map((l, i) => {
    const it = items.find((x) => x.sku === l.sku);
    return {
      id: `L${i}`,
      barcode: it?.barcode ?? "-",
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      price: l.price,
    };
  });
}

export function TransactionFormPage({
  variant,
  title,
  listPath,
  trx,
}: {
  variant: FormVariant;
  title: string;
  listPath: string;
  trx?: Trx | undefined;
}) {
  const [lines, setLines] = useState<Line[]>(trx ? linesFrom(trx) : [newLine(1), newLine(2)]);
  const [tujuan, setTujuan] = useState<string>(ALL);
  const total = lines.reduce((a, b) => a + b.qty * b.price, 0);
  const mode = trx ? "Edit" : "Tambah";

  return (
    <>
      <PageHeader
        title={`${mode} ${title}`}
        description={
          trx ? `Ubah data transaksi ${trx.no}` : `Buat transaksi ${title.toLowerCase()} baru`
        }
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to={listPath as never}>
              <ArrowLeft className="h-4 w-4" /> Kembali
            </Link>
          </Button>
        }
      />

      <Panel title="Informasi Transaksi">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Nomor Transaksi</Label>
            <Input
              readOnly
              value={
                trx?.no ??
                `${variant === "masuk" ? "BM" : variant === "keluar" ? "BK" : "TF"}/2026/02451`
              }
              className="rounded-xl font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" defaultValue="2026-07-31" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>{variant === "transfer" ? "Gudang Asal" : "Gudang"}</Label>
            <FilterSelect
              className="w-full"
              value={trx?.warehouse ?? ALL}
              onChange={() => {}}
              placeholder="Pilih Gudang"
              options={warehouses.map((w) => w.name)}
            />
          </div>

          {variant === "transfer" ? (
            <div className="space-y-1.5">
              <Label>Gudang Tujuan</Label>
              <FilterSelect
                className="w-full"
                value={trx?.destination ?? ALL}
                onChange={() => {}}
                placeholder="Pilih Gudang Tujuan"
                options={warehouses.map((w) => w.name)}
              />
            </div>
          ) : variant === "masuk" ? (
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <FilterSelect
                className="w-full"
                value={ALL}
                onChange={() => {}}
                placeholder="Pilih Supplier"
                options={suppliers.slice(0, 30).map((s) => s.name)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Tujuan Pengeluaran</Label>
                <FilterSelect
                  className="w-full"
                  value={tujuan}
                  onChange={setTujuan}
                  placeholder="Pilih Tujuan"
                  options={["Eksternal / Customer", "Produksi", "Departemen", "Gudang Lain"]}
                />
              </div>
              {tujuan === "Produksi" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Proyek</Label>
                    <FilterSelect
                      className="w-full"
                      value={ALL}
                      onChange={() => {}}
                      placeholder="Pilih Proyek"
                      options={projects}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Work Order</Label>
                    <FilterSelect
                      className="w-full"
                      value={ALL}
                      onChange={() => {}}
                      placeholder="Pilih Work Order"
                      options={workOrders.map((w) => `${w.no} — ${w.product}`)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Selesai WO</Label>
                    <Input type="date" defaultValue="2026-08-20" className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Deskripsi Pemakaian Produksi</Label>
                    <Input
                      placeholder="Contoh: material rakitan panel line 2"
                      className="rounded-xl"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Customer</Label>
                    <FilterSelect
                      className="w-full"
                      value={ALL}
                      onChange={() => {}}
                      placeholder="Pilih Customer"
                      options={customers.map((c) => c.name)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Departemen</Label>
                    <FilterSelect
                      className="w-full"
                      value={ALL}
                      onChange={() => {}}
                      placeholder="Pilih Departemen"
                      options={departments}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Keperluan</Label>
                    <Input
                      placeholder="Contoh: penggantian sparepart line 2"
                      className="rounded-xl"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label>Referensi</Label>
            <Input
              defaultValue={trx?.reference ?? ""}
              placeholder="PO / SJ / WO"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Catatan</Label>
            <Textarea placeholder="Catatan tambahan..." className="rounded-xl" rows={2} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Daftar Barang"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() => toast.info("Scanner aktif — arahkan ke barcode")}
            >
              <Barcode className="h-4 w-4" /> Scan
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={() => setLines((p) => [...p, newLine(p.length + 3)])}
            >
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {["Barcode", "Nama", "Qty", "Satuan", "Harga", "Subtotal", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{l.barcode}</td>
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={l.qty}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x) => (x.id === l.id ? { ...x, qty: Number(e.target.value) } : x)),
                        )
                      }
                      className="h-8 w-24 rounded-lg"
                    />
                  </td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="px-3 py-2">{formatIDR(l.price)}</td>
                  <td className="px-3 py-2 font-semibold">{formatIDR(l.qty * l.price)}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg text-destructive"
                      onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                      aria-label="Hapus baris"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {lines.map((l) => (
            <div key={l.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">{l.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{l.barcode}</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x) => (x.id === l.id ? { ...x, qty: Number(e.target.value) } : x)),
                    )
                  }
                  className="h-9 w-24 rounded-lg"
                />
                <span className="text-xs text-muted-foreground">{l.unit}</span>
                <span className="ml-auto text-sm font-semibold">{formatIDR(l.qty * l.price)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Grand Total</span>
          <span className="text-lg font-bold">{formatIDR(total)}</span>
        </div>
      </Panel>

      <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur md:bottom-4">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => toast.success("Disimpan sebagai draft")}
        >
          Simpan Draft
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => toast.success("Dokumen dikirim ke printer")}
        >
          <Printer className="h-4 w-4" /> Cetak
        </Button>
        <Button className="rounded-xl" onClick={() => toast.success("Transaksi berhasil disimpan")}>
          <Save className="h-4 w-4" /> Simpan
        </Button>
      </div>
    </>
  );
}
