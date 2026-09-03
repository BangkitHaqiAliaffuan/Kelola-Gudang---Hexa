import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, ScanLine, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "./kit";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import { useWmsScanner } from "@/hooks/use-wms-scanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  useDepartments,
  useItems,
  useSuppliers,
  useUsers,
  useWarehouses,
} from "@/hooks/use-master";
import { useCreateProcDoc, useSubmitProcDoc, useUpdateProcDoc } from "@/hooks/use-pengadaan";
import { isApiError } from "@/lib/api";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import type { ProcDocApi, ProcDocPayload } from "@/lib/pengadaan-types";

type FormLine = {
  key: string;
  itemId: string;
  qty: string;
  price: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return { key: `L${lineSeq}`, itemId: "", qty: "1", price: "" };
};

const today = () => new Date().toISOString().slice(0, 10);

/** Ambil query `?restock=itemId:qty,itemId:qty` dari dialog Saran Restock. */
function readRestockParam(): { itemId: string; qty: string }[] {
  if (typeof window === "undefined") return [];
  const raw = new URLSearchParams(window.location.search).get("restock");
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => {
      const [itemId, qty] = pair.split(":");
      return itemId && qty ? { itemId, qty } : null;
    })
    .filter((x): x is { itemId: string; qty: string } => x != null);
}

export function PurchaseRequestForm({
  doc,
  loading,
}: {
  doc: ProcDocApi | null;
  loading?: boolean;
}) {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");
  const create = useCreateProcDoc();
  const update = useUpdateProcDoc();
  const submit = useSubmitProcDoc();

  const { data: departments, isLoading: departmentsLoading } = useDepartments();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: items, isLoading: itemsLoading } = useItems();

  const isEdit = doc != null;

  const [documentDate, setDocumentDate] = useState(today());
  const [departmentId, setDepartmentId] = useState("");
  const [requesterId, setRequesterId] = useState(user?.id ? String(user.id) : "");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (warehousesLoading || isEdit || doc) return;
    const def = user?.default_warehouse_id;
    if (!def || warehouseId) return;
    if (!(warehouses?.data ?? []).some((w) => w.id === def)) return;
    // Jangan timpa restock param yang sudah isi dari URL
    const hasRestock = new URLSearchParams(window.location.search).has("restock");
    if (hasRestock) return;
    setWarehouseId(String(def));
  }, [warehousesLoading, warehouses, user, warehouseId, isEdit, doc]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>(() => {
    const restock = readRestockParam();
    if (restock.length) {
      return restock.map((r) => {
        lineSeq += 1;
        return { key: `L${lineSeq}`, itemId: r.itemId, qty: r.qty, price: "" };
      });
    }
    return [newLine()];
  });
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);

  const { scanOpen, setScanOpen, readerId } = useWmsScanner({
    items: (items?.data ?? []) as never,
    onPick: (item) => {
      if (scanTarget) pickItem(scanTarget, String(item.id));
    },
  });

  // Prefill saat mengedit dokumen Draft.
  useEffect(() => {
    if (!doc) return;
    setDocumentDate(doc.document_date?.slice(0, 10) ?? today());
    setDepartmentId(doc.department_id != null ? String(doc.department_id) : "");
    setRequesterId(doc.requester_user_id != null ? String(doc.requester_user_id) : "");
    setSupplierId(doc.supplier_id != null ? String(doc.supplier_id) : "");
    setWarehouseId(doc.warehouse_id != null ? String(doc.warehouse_id) : "");
    setReference(doc.reference ?? "");
    setNote(doc.note ?? "");
    lineSeq = Math.max(lineSeq, (doc.lines ?? []).length);
    setLines(
      (doc.lines ?? []).map((l) => ({
        key: `L${l.line_no}`,
        itemId: String(l.item_id),
        qty: String(l.qty),
        price: String(l.price),
      })),
    );
  }, [doc]);

  const departmentOptions: ComboboxOption[] = useMemo(
    () =>
      (departments?.data ?? []).map((d) => ({
        value: String(d.id),
        label: d.name,
        keywords: d.code,
      })),
    [departments],
  );

  const requesterOptions: ComboboxOption[] = useMemo(
    () =>
      (users?.data ?? []).map((u) => ({
        value: String(u.id),
        label: u.name,
        keywords: `${u.code} ${u.email ?? ""}`,
      })),
    [users],
  );

  const supplierOptions: ComboboxOption[] = useMemo(
    () => (suppliers?.data ?? []).map((s) => ({ value: String(s.id), label: s.name })),
    [suppliers],
  );

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => (warehouses?.data ?? []).map((w) => ({ value: String(w.id), label: w.name })),
    [warehouses],
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

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0), [lines]);
  const totalValue = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    [lines],
  );

  const itemOf = (itemId: string) => (items?.data ?? []).find((x) => String(x.id) === itemId);

  const patchLine = (key: string, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickItem = (key: string, itemId: string) => {
    const item = itemOf(itemId);
    const current = lines.find((l) => l.key === key);
    if (current && !current.price && item) {
      patchLine(key, { itemId, price: String(item.cost) });
      return;
    }
    patchLine(key, { itemId });
  };

  const buildPayload = (): ProcDocPayload | null => {
    if (!departmentId) {
      toast.error("Pilih departemen terlebih dahulu.");
      return null;
    }
    if (!supplierId) {
      toast.error("Pilih supplier terlebih dahulu.");
      return null;
    }
    if (!warehouseId) {
      toast.error("Pilih gudang terlebih dahulu.");
      return null;
    }
    const payloadLines = lines
      .filter((l) => l.itemId && l.qty)
      .map((l) => {
        const item = itemOf(l.itemId);
        return {
          item_id: Number(l.itemId),
          qty: Number(l.qty),
          unit_id: item?.unit_id ?? null,
          price: Number(l.price) || item?.cost || 0,
        };
      });
    if (payloadLines.length === 0) {
      toast.error("Lengkapi minimal satu baris barang (barang dan qty).");
      return null;
    }
    if (payloadLines.some((l) => l.qty < 1)) {
      toast.error("Qty tiap baris minimal 1.");
      return null;
    }
    return {
      kind: "PR",
      document_date: documentDate || today(),
      requester_user_id: requesterId ? Number(requesterId) : null,
      department_id: Number(departmentId),
      supplier_id: Number(supplierId),
      warehouse_id: Number(warehouseId),
      reference: reference.trim() || null,
      note: note.trim() || null,
      lines: payloadLines,
    };
  };

  const save = async (send: boolean) => {
    setApiErrors(undefined);
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const res = isEdit
        ? await update.mutateAsync({ id: doc!.id, payload })
        : await create.mutateAsync(payload);
      if (send) {
        const submitted = await submit.mutateAsync(res.data.id);
        toast.success(`PR ${submitted.data.no} dikirim untuk approval`);
      } else {
        toast.success(isEdit ? `PR ${res.data.no} diperbarui` : `Draft PR ${res.data.no} disimpan`);
      }
      navigate({ to: "/pengadaan/purchase-request" });
    } catch (err) {
      if (isApiError(err)) setApiErrors(err.errors);
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const docError = (field: string) => apiErrors?.[field]?.[0];
  const lineError = (index: number, field: string) => apiErrors?.[`lines.${index}.${field}`]?.[0];

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit Purchase Request ${doc?.no ?? ""}` : "Buat Purchase Request"}
        description="Permintaan pembelian barang dari departemen"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/pengadaan/purchase-request">
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
              value={isEdit ? (doc?.no ?? "PR/2026/#####") : "PR/2026/#####"}
              className="rounded-xl font-mono text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className="rounded-xl"
            />
            {docError("document_date") && (
              <p className="text-xs text-destructive">{docError("document_date")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Departemen</Label>
            <FormCombobox
              value={departmentId}
              onValueChange={setDepartmentId}
              options={departmentOptions}
              placeholder="Pilih Departemen"
              searchPlaceholder="Cari departemen..."
              side="bottom"
              avoidCollisions={false}
              loading={departmentsLoading}
            />
            {docError("department_id") && (
              <p className="text-xs text-destructive">{docError("department_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Pemohon</Label>
            <FormCombobox
              value={requesterId}
              onValueChange={setRequesterId}
              options={requesterOptions}
              placeholder="Pilih Pemohon"
              searchPlaceholder="Cari nama / NIK..."
              side="bottom"
              avoidCollisions={false}
              loading={usersLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <FormCombobox
              value={supplierId}
              onValueChange={setSupplierId}
              options={supplierOptions}
              placeholder="Pilih Supplier"
              searchPlaceholder="Cari supplier..."
              side="bottom"
              avoidCollisions={false}
              loading={suppliersLoading}
            />
            {docError("supplier_id") && (
              <p className="text-xs text-destructive">{docError("supplier_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Gudang</Label>
            <FormCombobox
              value={warehouseId}
              onValueChange={setWarehouseId}
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
            <Label>Referensi (Budget / PO)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Contoh: BUDGET-2026-001"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Catatan</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan tambahan (alasan pembelian, spesifikasi, dst.)..."
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
                {["Barang", "Qty", "Satuan", "Harga", "Subtotal", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const item = itemOf(l.itemId);
                const subtotal = (Number(l.qty) || 0) * (Number(l.price) || 0);
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="w-[320px] px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <FormCombobox
                          value={l.itemId}
                          onValueChange={(v) => pickItem(l.key, v)}
                          options={itemOptions}
                          placeholder="Pilih barang / scan barcode"
                          searchPlaceholder="Cari nama, SKU, barcode..."
                          side="top"
                          avoidCollisions={false}
                          loading={itemsLoading}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-lg"
                          aria-label="Scan barcode"
                          onClick={() => {
                            setScanTarget(l.key);
                            setScanOpen(true);
                          }}
                        >
                          <ScanLine className="h-4 w-4" />
                        </Button>
                      </div>
                      {lineError(i, "item_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "item_id")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                        className={`h-9 w-24 rounded-lg ${Number(l.qty) < 1 ? "border-destructive" : ""}`}
                      />
                      {lineError(i, "qty") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {item?.unit ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={l.price}
                        readOnly
                        className={`h-9 w-32 rounded-lg bg-muted text-muted-foreground ${Number(l.price) < 0 ? "border-destructive" : ""}`}
                      />
                      {lineError(i, "price") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "price")}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-right font-medium">
                      {formatIDR(subtotal)}
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
            const item = itemOf(l.itemId);
            const subtotal = (Number(l.qty) || 0) * (Number(l.price) || 0);
            return (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <FormCombobox
                      value={l.itemId}
                      onValueChange={(v) => pickItem(l.key, v)}
                      options={itemOptions}
                      placeholder="Pilih barang / scan barcode"
                      side="top"
                      avoidCollisions={false}
                      loading={itemsLoading}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-lg"
                      aria-label="Scan barcode"
                      onClick={() => {
                        setScanTarget(l.key);
                        setScanOpen(true);
                      }}
                    >
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className="h-9 w-20 rounded-lg"
                    />
                    <span className="text-xs text-muted-foreground">{item?.unit ?? "satuan"}</span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={l.price}
                      readOnly
                      className="h-9 w-28 rounded-lg bg-muted text-muted-foreground"
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <b>{formatIDR(subtotal)}</b>
                  </div>
                  {lineError(i, "item_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "item_id")}</p>
                  )}
                  {lineError(i, "qty") && (
                    <p className="text-xs text-destructive">{lineError(i, "qty")}</p>
                  )}
                  {lineError(i, "price") && (
                    <p className="text-xs text-destructive">{lineError(i, "price")}</p>
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">
            Total Qty <b className="ml-1">{formatNumber(totalQty)}</b>
          </span>
          <span className="text-sm font-medium">
            Total Nilai <b className="ml-1">{formatIDR(totalValue)}</b>
          </span>
        </div>
      </Panel>

      {canWrite && (
        <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur md:bottom-4">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => void save(false)}
            disabled={submitting}
          >
            <Save className="h-4 w-4" /> {isEdit ? "Simpan Perubahan" : "Simpan Draft"}
          </Button>
          <Button className="rounded-xl" onClick={() => void save(true)} disabled={submitting}>
            <Send className="h-4 w-4" /> {isEdit ? "Simpan & Kirim" : "Kirim untuk Approval"}
          </Button>
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Memuat dokumen...</p>
      )}

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
            Mendukung EAN-13, Code 128, dan QR
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
