import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "./kit";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import { PurchaseOrderSheet } from "./purchase-order-sheet";
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
import { useCreateStockDocument } from "@/hooks/use-persediaan";
import { useProcDocPo, useProcDocsPo } from "@/hooks/use-purchase-order";
import { isApiError } from "@/lib/api";
import { formatIDR } from "@/lib/wms-data";
import type { StockDocumentPayload } from "@/lib/persediaan-types";

type FormLine = {
  key: string;
  itemId: string;
  binId: string;
  qty: string;
  cost: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return { key: `L${lineSeq}`, itemId: "", binId: "", qty: "1", cost: "" };
};

const today = () => new Date().toISOString().slice(0, 10);

type BarangMasukFormProps = {
  backTo?: string;
  title?: string;
  description?: string;
  referenceLabel?: string;
  requireReference?: boolean;
  referenceCombobox?: boolean;
  initialPoId?: string | undefined;
};

export function BarangMasukForm({
  backTo = "/transaksi/masuk",
  title = "Tambah Barang Masuk",
  description = "Catat penerimaan barang dari supplier",
  referenceLabel = "Referensi (PO / SJ)",
  requireReference = false,
  referenceCombobox = false,
  initialPoId,
}: BarangMasukFormProps = {}) {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: bins, isLoading: binsLoading } = useBins();
  const { data: approvedPoes, isLoading: approvedPoesLoading } = useProcDocsPo("PO", {
    status: "Disetujui",
    enabled: referenceCombobox,
  });

  const [warehouseId, setWarehouseId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState(initialPoId ?? "");
  const [poSheetOpen, setPoSheetOpen] = useState(false);
  const prefilledPoRef = useRef<number | null>(null);

  const poIdNum = selectedPoId ? Number(selectedPoId) : undefined;
  const { data: poDetail, isLoading: poDetailLoading } = useProcDocPo(poIdNum);

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

  const poOptions: ComboboxOption[] = useMemo(
    () =>
      (approvedPoes?.data ?? []).map((p) => ({
        value: String(p.id),
        label: p.no,
        keywords: `${p.no} ${p.supplier ?? ""} ${p.warehouse ?? ""}`,
      })),
    [approvedPoes],
  );

  // Prefill supplier/gudang/No. PO + baris barang saat PO dipilih.
  useEffect(() => {
    const po = poDetail?.data;
    if (!referenceCombobox || po == null || poIdNum == null || prefilledPoRef.current === poIdNum) {
      return;
    }
    prefilledPoRef.current = poIdNum;
    setSupplier(po.supplier ?? "");
    setWarehouseId(po.warehouse_id != null ? String(po.warehouse_id) : "");
    setReference(po.no);
    setLines(
      (po.lines ?? []).map((l) => ({
        key: `P${(lineSeq += 1)}`,
        itemId: String(l.item_id),
        binId: "",
        qty: String(l.qty),
        cost: String(l.price),
      })),
    );
  }, [referenceCombobox, poIdNum, poDetail?.data]);

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

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = Number(l.qty) || 0;
        const cost = Number(l.cost) || 0;
        return sum + qty * cost;
      }, 0),
    [lines],
  );

  const patchLine = (key: string, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickItem = (key: string, itemId: string) => {
    const item = items?.data.find((x) => String(x.id) === itemId);
    patchLine(key, {
      itemId,
      cost: item && String(item.cost) ? String(item.cost) : "",
      binId:
        item?.default_bin_id != null && binsInWarehouse.some((b) => b.id === item.default_bin_id)
          ? String(item.default_bin_id)
          : "",
    });
  };

  const pickWarehouse = (id: string) => {
    setWarehouseId(id);
    setLines((prev) => prev.map((l) => ({ ...l, binId: "" })));
  };

  const buildPayload = (status: "Draft" | "Selesai"): StockDocumentPayload => ({
    type: "Penerimaan",
    status,
    document_date: date || today(),
    warehouse_id: Number(warehouseId),
    partner: supplier || null,
    reference_no: reference.trim() || null,
    pic: pic.trim() || null,
    note: note.trim() || null,
    lines: lines
      .filter((l) => l.itemId && l.binId && l.qty && l.cost)
      .map((l) => ({
        item_id: Number(l.itemId),
        qty: Number(l.qty),
        unit_cost: Number(l.cost),
        to_bin_id: Number(l.binId),
      })),
  });

  const submit = async (status: "Draft" | "Selesai") => {
    setApiErrors(undefined);
    if (!warehouseId) {
      toast.error("Pilih gudang terlebih dahulu.");
      return;
    }
    if (requireReference && !reference.trim()) {
      toast.error("Isi No. PO terlebih dahulu.");
      return;
    }
    const payload = buildPayload(status);
    if (payload.lines.length === 0) {
      toast.error("Lengkapi minimal satu baris barang (barang, lokasi bin, qty, dan harga).");
      return;
    }

    try {
      const res = await create.mutateAsync(payload);
      toast.success(
        status === "Selesai"
          ? `Dokumen ${res.data.no} berhasil diposting`
          : `Draft ${res.data.no} berhasil disimpan`,
      );
      navigate({ to: backTo });
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
        title={title}
        description={description}
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to={backTo}>
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
              value="BM/2026/#####"
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
              loading={warehousesLoading}
              side="bottom"
              avoidCollisions={false}
            />
            {docError("warehouse_id") && (
              <p className="text-xs text-destructive">{docError("warehouse_id")}</p>
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
              loading={suppliersLoading}
              side="bottom"
              avoidCollisions={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{referenceLabel}</Label>
            {referenceCombobox ? (
              <>
                <FormCombobox
                  value={selectedPoId}
                  onValueChange={(v) => {
                    setSelectedPoId(v);
                    if (!v) setReference("");
                  }}
                  options={poOptions}
                  placeholder="Pilih Purchase Order..."
                  searchPlaceholder="Cari no. PO / supplier..."
                  allowEmpty
                  side="bottom"
                  avoidCollisions={false}
                  loading={approvedPoesLoading}
                />
                <div className="flex items-center gap-2">
                  {selectedPoId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPoSheetOpen(true)}
                      disabled={!poDetail?.data}
                    >
                      <Eye className="h-4 w-4" /> Lihat Detail PO
                    </Button>
                  )}
                  {requireReference && !reference.trim() && (
                    <p className="text-xs text-destructive">No. PO wajib diisi.</p>
                  )}
                </div>
              </>
            ) : (
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Contoh: PO-2026-001"
                className="rounded-xl"
              />
            )}
            {!referenceCombobox && requireReference && !reference.trim() && (
              <p className="text-xs text-destructive">No. PO wajib diisi.</p>
            )}
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
              placeholder="Catatan tambahan..."
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
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {["Barang", "Tujuan Bin", "Qty", "Harga", "Subtotal", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const item = items?.data.find((x) => String(x.id) === l.itemId);
                const subtotal = (Number(l.qty) || 0) * (Number(l.cost) || 0);
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="w-[300px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.itemId}
                        onValueChange={(v) => pickItem(l.key, v)}
                        options={itemOptions}
                        placeholder="Pilih barang / scan barcode"
                        searchPlaceholder="Cari nama, SKU, barcode..."
                        loading={itemsLoading}
                        side="top"
                        avoidCollisions={false}
                      />
                      {lineError(i, "item_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "item_id")}</p>
                      )}
                    </td>
                    <td className="w-[200px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.binId}
                        onValueChange={(v) => patchLine(l.key, { binId: v })}
                        options={binOptions}
                        placeholder={warehouseId ? "Pilih Bin" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        loading={binsLoading}
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
                        className="h-9 w-24 rounded-lg"
                      />
                      {lineError(i, "qty") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        value={l.cost}
                        onChange={(e) => patchLine(l.key, { cost: e.target.value })}
                        className="h-9 w-28 rounded-lg"
                      />
                      {lineError(i, "unit_cost") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "unit_cost")}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-semibold">
                      {formatIDR(subtotal)}
                      <p className="text-[11px] font-normal text-muted-foreground">
                        {item?.unit ?? ""}
                      </p>
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
            const item = items?.data.find((x) => String(x.id) === l.itemId);
            return (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <FormCombobox
                    value={l.itemId}
                    onValueChange={(v) => pickItem(l.key, v)}
                    options={itemOptions}
                    placeholder="Pilih barang"
                    loading={itemsLoading}
                    side="top"
                    avoidCollisions={false}
                  />
                  <FormCombobox
                    value={l.binId}
                    onValueChange={(v) => patchLine(l.key, { binId: v })}
                    options={binOptions}
                    placeholder={warehouseId ? "Pilih Bin" : "Pilih Gudang dulu"}
                    loading={binsLoading}
                    side="top"
                    avoidCollisions={false}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className="h-9 w-24 rounded-lg"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={l.cost}
                      onChange={(e) => patchLine(l.key, { cost: e.target.value })}
                      className="h-9 w-28 rounded-lg"
                    />
                    <span className="ml-auto text-sm font-semibold">
                      {formatIDR((Number(l.qty) || 0) * (Number(l.cost) || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item?.unit ?? ""}</span>
                    <button
                      type="button"
                      className="text-destructive"
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      disabled={lines.length === 1}
                    >
                      Hapus
                    </button>
                  </div>
                  {lineError(i, "to_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                  )}
                </div>
              </div>
            );
          })}
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
          onClick={() => submit("Draft")}
          disabled={create.isPending || !canCreate}
        >
          <Save className="h-4 w-4" /> Simpan Draft
        </Button>
        <Button
          className="rounded-xl"
          onClick={() => setConfirmPosting(true)}
          disabled={create.isPending || !canCreate}
        >
          <Save className="h-4 w-4" /> Simpan & Posting
        </Button>
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

      {referenceCombobox && (
        <PurchaseOrderSheet
          doc={poSheetOpen ? (poDetail?.data ?? null) : null}
          isLoading={poSheetOpen && poDetailLoading}
          onOpenChange={(o) => !o && setPoSheetOpen(false)}
        />
      )}
    </>
  );
}
