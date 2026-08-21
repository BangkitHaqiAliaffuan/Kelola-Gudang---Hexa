import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "./kit";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useBins, useCustomers, useItems, useWarehouses } from "@/hooks/use-master";
import {
  useCreateStockDocument,
  useStockDocument,
  useStockDocuments,
} from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/wms-data";
import type {
  StockDocumentApi,
  StockDocumentLineApi,
  StockDocumentPayload,
} from "@/lib/persediaan-types";

const returReasons = ["Cacat", "Kelebihan Kirim", "Salah Barang", "Kadaluarsa", "Lainnya"];

type FormLine = {
  key: string;
  itemId: string;
  binId: string;
  qty: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return { key: `L${lineSeq}`, itemId: "", binId: "", qty: "1" };
};

const today = () => new Date().toISOString().slice(0, 10);

export function ReturPenjualanForm() {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: items } = useItems();
  const { data: bins } = useBins();

  const [warehouseId, setWarehouseId] = useState("");
  const [customer, setCustomer] = useState("");
  const [sourceDocId, setSourceDocId] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSourceDoc, setSelectedSourceDoc] = useState<StockDocumentApi | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);

  // Dokumen Pengeluaran (Barang Keluar) Selesai yang bisa jadi sumber retur —
  // dimuat async per gudang (per_page kecil + server-side search) agar form
  // tetap ringan meski dokumen mencapai ribuan. Dipicu setelah gudang dipilih.
  const debouncedSourceSearch = useDebouncedValue(sourceSearch);
  const { data: outboundDocs, isLoading: outboundLoading } = useStockDocuments({
    type: "Pengeluaran",
    status: "Selesai",
    warehouseId: warehouseId ? Number(warehouseId) : null,
    search: debouncedSourceSearch.trim() || null,
    perPage: 20,
    enabled: warehouseId !== "",
  });
  const { data: sourceDetail } = useStockDocument(sourceDocId ? Number(sourceDocId) : undefined);

  const binsInWarehouse = useMemo(
    () =>
      warehouseId
        ? (bins?.data ?? []).filter((b) => b.warehouse_id === Number(warehouseId) && b.is_active)
        : [],
    [bins, warehouseId],
  );

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => (warehouses?.data ?? []).map((w) => ({ value: String(w.id), label: w.name })),
    [warehouses],
  );

  const customerOptions: ComboboxOption[] = useMemo(
    () => (customers?.data ?? []).map((c) => ({ value: c.name, label: c.name })),
    [customers],
  );

  // Dokumen Barang Keluar (Pengeluaran Selesai) di gudang terpilih — dimuat
  // async dari server (per_page=20 + search). Dokumen yang sedang dipilih tetap
  // disertakan agar labelnya tidak hilang saat hasil search/gudang menyaringnya
  // keluar. Customer terisi otomatis dari dokumen terpilih (tidak memfilter
  // daftar). Barang retur harus berasal dari salah satu baris dokumen ini
  // (validasi server: cap qty per baris + harga baris sumber).
  const sourceDocOptions: ComboboxOption[] = useMemo(() => {
    const docs = outboundDocs?.data ?? [];
    const seen = new Set(docs.map((d) => d.id));
    const merged = [
      ...(selectedSourceDoc && !seen.has(selectedSourceDoc.id) ? [selectedSourceDoc] : []),
      ...docs,
    ];
    return merged.map((d) => ({
      value: String(d.id),
      label: `${d.no} · ${formatDate(d.document_date)}${d.partner ? ` · ${d.partner}` : ""}`,
      keywords: `${d.no} ${d.partner ?? ""} ${d.reference_no ?? ""}`,
    }));
  }, [outboundDocs, selectedSourceDoc]);

  // Baris barang dari dokumen sumber terpilih (qty negatif = yang dikeluarkan).
  const sourceLines = useMemo(
    () =>
      sourceDocId
        ? (sourceDetail?.data.lines ?? []).filter(
            (l) => Math.abs(l.qty ?? 0) > 0 && l.from_bin_id != null,
          )
        : [],
    [sourceDocId, sourceDetail],
  );

  const reasonOptions: ComboboxOption[] = useMemo(
    () => returReasons.map((r) => ({ value: r, label: r })),
    [],
  );

  const itemOptions: ComboboxOption[] = useMemo(
    () =>
      (items?.data ?? []).map((it) => ({
        value: String(it.id),
        label: it.name,
        keywords: `${it.sku} ${it.barcode ?? ""} ${it.internal_barcode ?? ""}`,
      })),
    [items],
  );

  const binOptions: ComboboxOption[] = useMemo(
    () => [
      { value: "", label: "Tanpa Bin — Lantai / Gudang", keywords: "lantai gudang tanpa bin" },
      ...binsInWarehouse.map((b) => ({
        value: String(b.id),
        label: b.full_address ?? b.name,
        keywords: `${b.code} ${b.rack_name ?? ""}`,
      })),
    ],
    [binsInWarehouse],
  );

  // Bin tujuan retur dari baris Pengeluaran sumber: barang dikeluarkan dari
  // `from_bin_id`, jadi retur kembali ke bin yang sama.
  const sourceLineBin = (s: StockDocumentLineApi): number | null => s.from_bin_id;

  // Baris sumber untuk sebuah barang (dari dokumen Pengeluaran terpilih). Bin
  // tujuan retur wajib bin asal baris sumber; qty maksimum = qty dikeluarkan
  // baris sumber (abs dari qty bertanda negatif).
  const lineSource = (l: FormLine) => {
    if (!sourceLines.length || !l.itemId) return undefined;
    return (
      sourceLines.find(
        (s) => s.item_id === Number(l.itemId) && sourceLineBin(s) === Number(l.binId),
      ) ?? sourceLines.find((s) => s.item_id === Number(l.itemId))
    );
  };

  const lineItemOptions = (l: FormLine): ComboboxOption[] => {
    // Dengan dokumen sumber, barang dibatasi pada baris Pengeluaran sumber.
    if (sourceDocId) {
      const ids = new Set(sourceLines.map((s) => s.item_id));
      return itemOptions.filter((o) => ids.has(Number(o.value)));
    }
    return itemOptions;
  };

  // Dropdown bin scoped: dengan dokumen sumber, bin hanya bin asal (from_bin_id)
  // dari baris dokumen itu (tujuan retur).
  const lineBinOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (sourceDocId) {
      if (!l.itemId) return [];
      const ids = new Set(
        sourceLines
          .filter((s) => s.item_id === Number(l.itemId))
          .map((s) => (sourceLineBin(s) === null ? "NULL" : String(sourceLineBin(s)))),
      );
      return binOptions.filter((o) => ids.has(o.value === "" ? "NULL" : o.value));
    }
    return binOptions;
  };

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0), [lines]);

  const patchLine = (
    key: string,
    patch: Partial<FormLine> | ((line: FormLine) => Partial<FormLine>),
  ) =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, ...(typeof patch === "function" ? patch(l) : patch) } : l,
      ),
    );

  const pickItem = (key: string, itemId: string) => {
    patchLine(key, (line) => {
      // Dengan dokumen sumber: bin dikunci ke bin asal baris Pengeluaran sumber.
      if (sourceDocId) {
        const src = lineSource({ ...line, itemId });
        const binId = src ? sourceLineBin(src) : null;
        return {
          itemId,
          binId: binId != null ? String(binId) : "",
        };
      }
      const item = items?.data.find((x) => String(x.id) === itemId);
      return {
        itemId,
        binId:
          item?.default_bin_id != null && binsInWarehouse.some((b) => b.id === item.default_bin_id)
            ? String(item.default_bin_id)
            : "",
      };
    });
  };

  const pickBin = (key: string, binId: string) => patchLine(key, { binId });

  const pickWarehouse = (id: string) => {
    setWarehouseId(id);
    setSourceDocId("");
    setSelectedSourceDoc(null);
    setSourceSearch("");
    setLines((prev) => prev.map((l) => ({ ...l, binId: "" })));
  };

  // Pilih dokumen Pengeluaran sumber: customer ikut terisi dari partner dokumen
  // (tersinkron penuh saat pindah ke dokumen lain), daftar barang dibatasi ke
  // baris dokumen itu.
  const pickSourceDoc = (id: string) => {
    setSourceDocId(id);
    const doc =
      (outboundDocs?.data ?? []).find((d) => String(d.id) === id) ??
      (selectedSourceDoc && String(selectedSourceDoc.id) === id ? selectedSourceDoc : null);
    setSelectedSourceDoc(doc);
    setCustomer(doc?.partner ?? "");
    setLines([newLine()]);
  };

  const buildNote = (): string | null => {
    const parts: string[] = [];
    if (reason) parts.push(`Alasan: ${reason}`);
    const custom = note.trim();
    if (custom) parts.push(custom);
    return parts.length ? parts.join("\n") : null;
  };

  const buildPayload = (status: "Draft" | "Selesai"): StockDocumentPayload => ({
    type: "Retur Penjualan",
    status,
    document_date: date || today(),
    warehouse_id: Number(warehouseId),
    source_document_id: sourceDocId ? Number(sourceDocId) : null,
    partner: customer || null,
    reference_no: reference.trim() || null,
    pic: pic.trim() || null,
    note: buildNote(),
    lines: lines
      .filter((l) => l.itemId && l.binId && l.qty)
      .map((l) => ({
        item_id: Number(l.itemId),
        qty: Number(l.qty),
        to_bin_id: Number(l.binId),
        source_line_id: sourceDocId ? (lineSource(l)?.id ?? null) : null,
      })),
  });

  const submit = async (status: "Draft" | "Selesai") => {
    setApiErrors(undefined);
    if (!warehouseId) {
      toast.error("Pilih gudang terlebih dahulu.");
      return;
    }
    if (!sourceDocId) {
      toast.error("Pilih dokumen Barang Keluar sumber terlebih dahulu.");
      return;
    }
    const payload = buildPayload(status);
    if (payload.lines.length === 0) {
      toast.error("Lengkapi minimal satu baris barang (barang, lokasi bin, dan qty).");
      return;
    }

    const overSourceLine = lines.find((l) => {
      if (!l.itemId || !l.binId || !l.qty) return false;
      const src = lineSource(l);
      return src != null && Number(l.qty) > Math.abs(src.qty ?? 0);
    });
    if (overSourceLine) {
      toast.error("Ada baris dengan qty melebihi jumlah barang pada dokumen sumber.");
      return;
    }

    try {
      const res = await create.mutateAsync(payload);
      toast.success(
        status === "Selesai"
          ? `Dokumen ${res.data.no} berhasil diposting`
          : `Draft ${res.data.no} berhasil disimpan`,
      );
      navigate({ to: "/transaksi/retur-penjualan" });
    } catch (err) {
      if (isApiError(err)) setApiErrors(err.errors);
      toast.error((err as Error).message);
    }
  };

  const docError = (field: string) => apiErrors?.[field]?.[0];
  const lineError = (index: number, field: string) => apiErrors?.[`lines.${index}.${field}`]?.[0];

  return (
    <>
      <PageHeader
        title="Tambah Retur Penjualan"
        description="Catat penerimaan barang retur dari customer"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/transaksi/retur-penjualan">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </Link>
          </Button>
        }
      />

      <Panel title="Informasi Dokumen">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Nomor Dokumen</Label>
            <Input
              readOnly
              value="RJ/2026/#####"
              className="rounded-xl font-mono text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
            {docError("document_date") && (
              <p className="text-xs text-destructive">{docError("document_date")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Gudang</Label>
            <FormCombobox
              value={warehouseId}
              onValueChange={pickWarehouse}
              options={warehouseOptions}
              placeholder="Pilih Gudang"
              searchPlaceholder="Cari gudang..."
              side="bottom"
              avoidCollisions={false}
              loading={warehousesLoading}
            />
            {docError("warehouse_id") && (
              <p className="text-xs text-destructive">{docError("warehouse_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Dari Barang Keluar</Label>
            <FormCombobox
              value={sourceDocId}
              onValueChange={pickSourceDoc}
              options={sourceDocOptions}
              onSearchChange={setSourceSearch}
              placeholder={warehouseId ? "Pilih dokumen sumber..." : "Pilih gudang dulu"}
              searchPlaceholder="Cari nomor / customer..."
              loading={outboundLoading}
              side="bottom"
              avoidCollisions={false}
            />
            {!warehouseId && (
              <p className="text-xs text-muted-foreground">Pilih gudang untuk memuat dokumen.</p>
            )}
            {sourceDocId && sourceDetail?.data && sourceLines.length === 0 && (
              <p className="text-xs text-destructive">
                Dokumen ini tidak memiliki barang yang bisa diretur.
              </p>
            )}
            {docError("source_document_id") && (
              <p className="text-xs text-destructive">{docError("source_document_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <FormCombobox
              value={customer}
              onValueChange={setCustomer}
              options={customerOptions}
              placeholder="Pilih Customer"
              searchPlaceholder="Cari customer..."
              allowEmpty
              side="bottom"
              avoidCollisions={false}
              loading={customersLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Alasan Retur</Label>
            <FormCombobox
              value={reason}
              onValueChange={setReason}
              options={reasonOptions}
              placeholder="Pilih alasan..."
              searchPlaceholder="Cari alasan..."
              allowEmpty
              side="bottom"
              avoidCollisions={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Referensi (SJ / invoice retur)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Contoh: INV-2026-001"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>PIC</Label>
            <Input value={pic} onChange={(e) => setPic(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Catatan</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan tambahan (dikirim bersama alasan retur)..."
              className="rounded-xl"
              rows={2}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Daftar Barang"
        actions={
          <Button
            size="sm"
            className="rounded-lg"
            onClick={() => setLines((p) => [...p, newLine()])}
          >
            <Plus className="h-4 w-4" /> Tambah Baris
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {["Barang", "Tujuan Bin", "Qty", "Maks", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const src = lineSource(l);
                const overSource = src != null && (Number(l.qty) || 0) > Math.abs(src.qty ?? 0);
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="w-[320px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.itemId}
                        onValueChange={(v) => pickItem(l.key, v)}
                        options={lineItemOptions(l)}
                        placeholder="Pilih barang / scan barcode"
                        searchPlaceholder="Cari nama, SKU, barcode..."
                        side="top"
                        avoidCollisions={false}
                      />
                      {lineError(i, "item_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "item_id")}</p>
                      )}
                    </td>
                    <td className="w-[220px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.binId}
                        onValueChange={(v) => pickBin(l.key, v)}
                        options={lineBinOptions(l)}
                        placeholder={warehouseId ? "Pilih Bin Tujuan" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                      />
                      {lineError(i, "to_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                        className={`h-9 w-24 rounded-lg ${overSource ? "border-destructive" : ""}`}
                      />
                      {lineError(i, "qty") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                      )}
                      {overSource && (
                        <p className="mt-1 text-xs text-destructive">
                          Melebihi jumlah dari dokumen sumber (maks{" "}
                          {formatNumber(Math.abs(src?.qty ?? 0))})
                        </p>
                      )}
                      {src && !overSource && sourceDocId && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Maks {formatNumber(Math.abs(src.qty ?? 0))} dari {sourceDetail?.data.no}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {src ? formatNumber(Math.abs(src.qty ?? 0)) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg text-destructive"
                        onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                        disabled={lines.length === 1}
                        aria-label="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {lines.map((l, i) => {
            const src = lineSource(l);
            const overSource = src != null && (Number(l.qty) || 0) > Math.abs(src.qty ?? 0);
            return (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <FormCombobox
                    value={l.itemId}
                    onValueChange={(v) => pickItem(l.key, v)}
                    options={lineItemOptions(l)}
                    placeholder="Pilih barang / scan barcode"
                    side="top"
                    avoidCollisions={false}
                  />
                  <FormCombobox
                    value={l.binId}
                    onValueChange={(v) => pickBin(l.key, v)}
                    options={lineBinOptions(l)}
                    placeholder={warehouseId ? "Pilih Bin Tujuan" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className={`h-9 w-24 rounded-lg ${overSource ? "border-destructive" : ""}`}
                    />
                    <span className="ml-auto text-sm text-muted-foreground">
                      Maks {src ? formatNumber(Math.abs(src.qty ?? 0)) : "—"}
                    </span>
                  </div>
                  {overSource && (
                    <p className="text-xs text-destructive">
                      Melebihi jumlah dari dokumen sumber (maks{" "}
                      {formatNumber(Math.abs(src?.qty ?? 0))}).
                    </p>
                  )}
                  {src && !overSource && sourceDocId && (
                    <p className="text-xs text-muted-foreground">
                      Maks {formatNumber(Math.abs(src.qty ?? 0))} dari {sourceDetail?.data.no}
                    </p>
                  )}
                  {lineError(i, "to_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span />
                    <button
                      type="button"
                      className="text-destructive"
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      disabled={lines.length === 1}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Total Qty</span>
          <span className="text-lg font-bold">{formatNumber(totalQty)}</span>
        </div>
      </Panel>

      <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur md:bottom-4">
        {canCreate && (
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => submit("Draft")}
              disabled={create.isPending}
            >
              <Save className="h-4 w-4" /> Simpan Draft
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => setConfirmPosting(true)}
              disabled={create.isPending}
            >
              <Save className="h-4 w-4" /> Simpan & Posting
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmPosting} onOpenChange={(o) => !o && setConfirmPosting(false)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Posting dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen akan diposting dan stok langsung ter-update. Tindakan ini tidak dapat
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" onClick={() => setConfirmPosting(false)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={(e) => {
                e.preventDefault();
                setConfirmPosting(false);
                void submit("Selesai");
              }}
            >
              Ya, Posting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
