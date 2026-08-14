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
import { useBins, useItems, useSuppliers, useWarehouses } from "@/hooks/use-master";
import {
  useCreateStockDocument,
  useStockDocument,
  useStockDocuments,
  useStockRows,
} from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/wms-data";
import type { StockDocumentPayload } from "@/lib/persediaan-types";

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

export function ReturPembelianForm() {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: items } = useItems();
  const { data: bins } = useBins();
  const { data: stockRows, isLoading: stockLoading } = useStockRows();

  const [warehouseId, setWarehouseId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [sourceDocId, setSourceDocId] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);

  // Dokumen Penerimaan (Barang Masuk) Selesai yang bisa jadi sumber retur.
  const { data: incomingDocs, isLoading: incomingLoading } = useStockDocuments({
    type: "Penerimaan",
    status: "Selesai",
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

  const supplierOptions: ComboboxOption[] = useMemo(
    () => (suppliers?.data ?? []).map((s) => ({ value: s.name, label: s.name })),
    [suppliers],
  );

  // Dokumen Barang Masuk (Penerimaan Selesai) di gudang terpilih — difilter juga
  // oleh supplier bila sudah dipilih. Barang retur harus berasal dari salah satu
  // baris dokumen ini (validasi server: cap qty per baris + harga beli asal).
  const sourceDocOptions: ComboboxOption[] = useMemo(() => {
    const docs = (incomingDocs?.data ?? []).filter(
      (d) =>
        (!warehouseId || d.warehouse_id === Number(warehouseId)) &&
        (!supplier || d.partner === supplier),
    );
    return docs.map((d) => ({
      value: String(d.id),
      label: `${d.no} · ${formatDate(d.document_date)}${d.partner ? ` · ${d.partner}` : ""}`,
      keywords: `${d.no} ${d.partner ?? ""} ${d.reference_no ?? ""}`,
    }));
  }, [incomingDocs, warehouseId, supplier]);

  // Baris barang dari dokumen sumber terpilih (qty positif = yang diterima).
  const sourceLines = useMemo(
    () => (sourceDocId ? (sourceDetail?.data.lines ?? []) : []).filter((l) => (l.qty ?? 0) > 0),
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
    () =>
      binsInWarehouse.map((b) => ({
        value: String(b.id),
        label: b.full_address ?? b.name,
        keywords: `${b.code} ${b.rack_name ?? ""}`,
      })),
    [binsInWarehouse],
  );

  // Ketersediaan per (barang, bin) dari /persediaan/stock; dipakai sebagai
  // peringatan proaktif + penyaringan opsi barang per bin — validasi
  // otoritatif tetap server saat posting.
  const availableByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stockRows?.data ?? []) map.set(`${r.item_id}:${r.bin_id}`, r.available);
    return map;
  }, [stockRows]);

  const availableItemIdsByBin = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of stockRows?.data ?? []) {
      if (r.stock <= 0) continue;
      const binKey = String(r.bin_id);
      const set = map.get(binKey) ?? new Set<string>();
      set.add(String(r.item_id));
      map.set(binKey, set);
    }
    return map;
  }, [stockRows]);

  // Bin-bin yang benar-benar berisi stok di gudang terpilih — dipakai sebagai
  // scope dropdown bin agar operator tidak diganggu bin kosong.
  const stockedBinIds = useMemo(() => {
    const set = new Set<number>();
    if (!warehouseId) return set;
    for (const r of stockRows?.data ?? []) {
      if (r.stock > 0 && r.warehouse_id === Number(warehouseId)) set.add(r.bin_id);
    }
    return set;
  }, [stockRows, warehouseId]);

  // Kandidat bin per barang di gudang terpilih, diurutkan available desc —
  // dasar auto-suggest bin saat barang dipilih.
  const binCandidatesByItem = useMemo(() => {
    const map = new Map<string, { bin_id: number; available: number }[]>();
    if (!warehouseId) return map;
    for (const r of stockRows?.data ?? []) {
      if (r.stock <= 0 || r.warehouse_id !== Number(warehouseId)) continue;
      const list = map.get(String(r.item_id)) ?? [];
      list.push({ bin_id: r.bin_id, available: r.available });
      map.set(String(r.item_id), list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.available - a.available || a.bin_id - b.bin_id);
    }
    return map;
  }, [stockRows, warehouseId]);

  const lineAvailable = (l: FormLine): number | undefined =>
    l.itemId && l.binId ? availableByKey.get(`${l.itemId}:${l.binId}`) : undefined;

  // Baris sumber untuk sebuah barang (dari dokumen Penerimaan terpilih). Bin asal
  // retur wajib bin tujuan baris sumber; qty maksimum = qty diterima baris sumber.
  const lineSource = (l: FormLine) => {
    if (!sourceLines.length || !l.itemId) return undefined;
    return (
      sourceLines.find(
        (s) =>
          s.item_id === Number(l.itemId) &&
          (s.to_bin_id == null || s.to_bin_id === Number(l.binId)),
      ) ?? sourceLines.find((s) => s.item_id === Number(l.itemId))
    );
  };

  const lineItemOptions = (l: FormLine): ComboboxOption[] => {
    // Dengan dokumen sumber, barang dibatasi pada baris Penerimaan sumber.
    if (sourceDocId) {
      const ids = new Set(sourceLines.map((s) => s.item_id));
      return itemOptions.filter((o) => ids.has(Number(o.value)));
    }
    if (!l.binId) return itemOptions;
    const availableIds = availableItemIdsByBin.get(l.binId);
    if (!availableIds) return [];
    return itemOptions.filter((o) => availableIds.has(o.value));
  };

  // Dropdown bin scoped: hanya bin berisi stok di gudang ini; saat barang sudah
  // dipilih, hanya bin yang memegang barang tersebut (berisi stok). Dengan dokumen
  // sumber, bin hanya yang dipakai baris sumber (bin tujuan Penerimaan).
  const lineBinOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (sourceDocId) {
      const src = lineSource(l);
      if (!l.itemId || !src || src.to_bin_id == null) return [];
      return binOptions.filter((o) => Number(o.value) === src.to_bin_id);
    }
    if (l.itemId) {
      const candidates = binCandidatesByItem.get(l.itemId) ?? [];
      const ids = new Set(candidates.map((c) => c.bin_id));
      return binOptions.filter((o) => ids.has(Number(o.value)));
    }
    return binOptions.filter((o) => stockedBinIds.has(Number(o.value)));
  };

  const hasStockInWarehouse = (l: FormLine): boolean =>
    !l.itemId || (binCandidatesByItem.get(l.itemId)?.length ?? 0) > 0;

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
      // Dengan dokumen sumber: bin dikunci ke bin tujuan baris Penerimaan sumber.
      if (sourceDocId) {
        const src = lineSource({ ...line, itemId });
        return {
          itemId,
          binId: src?.to_bin_id != null ? String(src.to_bin_id) : "",
        };
      }
      const item = items?.data.find((x) => String(x.id) === itemId);
      const candidates = binCandidatesByItem.get(itemId) ?? [];
      const currentValid = Boolean(
        line.binId && candidates.some((c) => c.bin_id === Number(line.binId)),
      );
      if (currentValid) return { itemId };
      const preferredBin =
        item?.default_bin_id != null && candidates.some((c) => c.bin_id === item.default_bin_id)
          ? String(item.default_bin_id)
          : candidates[0]
            ? String(candidates[0].bin_id)
            : "";
      return { itemId, binId: preferredBin };
    });
  };

  const pickBin = (key: string, binId: string) => patchLine(key, { binId });

  const pickWarehouse = (id: string) => {
    setWarehouseId(id);
    setSourceDocId("");
    setLines((prev) => prev.map((l) => ({ ...l, binId: "" })));
  };

  // Pilih dokumen Penerimaan sumber: supplier ikut terisi dari partner dokumen,
  // daftar barang dibatasi ke baris dokumen itu.
  const pickSourceDoc = (id: string) => {
    setSourceDocId(id);
    const doc = (incomingDocs?.data ?? []).find((d) => String(d.id) === id);
    if (doc?.partner) setSupplier((prev) => prev || (doc.partner ?? ""));
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
    type: "Retur Pembelian",
    status,
    document_date: date || today(),
    warehouse_id: Number(warehouseId),
    source_document_id: sourceDocId ? Number(sourceDocId) : null,
    partner: supplier || null,
    reference_no: reference.trim() || null,
    pic: pic.trim() || null,
    note: buildNote(),
    lines: lines
      .filter((l) => l.itemId && l.binId && l.qty)
      .map((l) => ({
        item_id: Number(l.itemId),
        qty: Number(l.qty),
        from_bin_id: Number(l.binId),
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
      toast.error("Pilih dokumen Barang Masuk sumber terlebih dahulu.");
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
      return src != null && Number(l.qty) > (src.qty ?? 0);
    });
    if (overSourceLine) {
      toast.error("Ada baris dengan qty melebihi jumlah barang pada dokumen sumber.");
      return;
    }

    const overLine = lines.find((l) => {
      if (!l.itemId || !l.binId || !l.qty) return false;
      const available = lineAvailable(l);
      return available !== undefined && Number(l.qty) > available;
    });
    if (overLine) {
      toast.error("Ada baris dengan qty melebihi stok tersedia di bin terpilih.");
      return;
    }

    try {
      const res = await create.mutateAsync(payload);
      toast.success(
        status === "Selesai"
          ? `Dokumen ${res.data.no} berhasil diposting`
          : `Draft ${res.data.no} berhasil disimpan`,
      );
      navigate({ to: "/transaksi/retur-pembelian" });
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
        title="Tambah Retur Pembelian"
        description="Catat pengembalian barang ke supplier"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/transaksi/retur-pembelian">
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
              value="RP/2026/#####"
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
            <Label>Dari Barang Masuk</Label>
            <FormCombobox
              value={sourceDocId}
              onValueChange={pickSourceDoc}
              options={sourceDocOptions}
              placeholder={warehouseId ? "Pilih dokumen sumber..." : "Pilih gudang dulu"}
              searchPlaceholder="Cari nomor / supplier / referensi..."
              loading={incomingLoading}
              side="bottom"
              avoidCollisions={false}
            />
            {!warehouseId && (
              <p className="text-xs text-muted-foreground">Pilih gudang untuk memuat dokumen.</p>
            )}
            {docError("source_document_id") && (
              <p className="text-xs text-destructive">{docError("source_document_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <FormCombobox
              value={supplier}
              onValueChange={setSupplier}
              options={supplierOptions}
              placeholder="Pilih Supplier"
              searchPlaceholder="Cari supplier..."
              allowEmpty
              side="bottom"
              avoidCollisions={false}
              loading={suppliersLoading}
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
            <Label>Referensi (PO / SJ retur)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Contoh: PO-2026-001"
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
                {["Barang", "Asal Bin", "Qty", "Tersedia", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const available = lineAvailable(l);
                const overStock = available !== undefined && (Number(l.qty) || 0) > available;
                const src = lineSource(l);
                const overSource = src != null && (Number(l.qty) || 0) > (src.qty ?? 0);
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
                        placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                        loading={stockLoading}
                      />
                      {l.itemId && !hasStockInWarehouse(l) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Stok tidak tersedia di gudang ini.
                        </p>
                      )}
                      {lineError(i, "from_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">
                          {lineError(i, "from_bin_id")}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                        className={`h-9 w-24 rounded-lg ${overStock || overSource ? "border-destructive" : ""}`}
                      />
                      {lineError(i, "qty") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                      )}
                      {overStock && (
                        <p className="mt-1 text-xs text-destructive">
                          Melebihi tersedia ({formatNumber(available)})
                        </p>
                      )}
                      {overSource && (
                        <p className="mt-1 text-xs text-destructive">
                          Melebihi jumlah dari dokumen sumber (maks {formatNumber(src?.qty ?? 0)})
                        </p>
                      )}
                      {src && !overSource && sourceDocId && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Maks {formatNumber(src.qty ?? 0)} dari {sourceDetail?.data.no}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {available !== undefined ? formatNumber(available) : "—"}
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
            const available = lineAvailable(l);
            const overStock = available !== undefined && (Number(l.qty) || 0) > available;
            const src = lineSource(l);
            const overSource = src != null && (Number(l.qty) || 0) > (src.qty ?? 0);
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
                    placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                    loading={stockLoading}
                  />
                  {l.itemId && !hasStockInWarehouse(l) && (
                    <p className="text-xs text-muted-foreground">
                      Stok tidak tersedia di gudang ini.
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className={`h-9 w-24 rounded-lg ${overStock || overSource ? "border-destructive" : ""}`}
                    />
                    <span className="ml-auto text-sm text-muted-foreground">
                      Tersedia {available !== undefined ? formatNumber(available) : "—"}
                    </span>
                  </div>
                  {overStock && (
                    <p className="text-xs text-destructive">
                      Qty melebihi stok tersedia di bin ini.
                    </p>
                  )}
                  {overSource && (
                    <p className="text-xs text-destructive">
                      Melebihi jumlah dari dokumen sumber (maks {formatNumber(src?.qty ?? 0)}).
                    </p>
                  )}
                  {src && !overSource && sourceDocId && (
                    <p className="text-xs text-muted-foreground">
                      Maks {formatNumber(src.qty ?? 0)} dari {sourceDetail?.data.no}
                    </p>
                  )}
                  {lineError(i, "from_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "from_bin_id")}</p>
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
