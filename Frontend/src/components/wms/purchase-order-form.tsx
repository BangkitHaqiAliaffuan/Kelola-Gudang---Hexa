import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, FileDown, Plus, Save, ScanLine, Send, Trash2 } from "lucide-react";
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
import { PurchaseRequestSheet } from "./purchase-request-sheet";
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
import { useDepartments, useItems, useSuppliers, useWarehouses } from "@/hooks/use-master";
import {
  useApprovedProcDocsPr,
  useCreateProcDocPo,
  useProcDocPo,
  useSubmitProcDocPo,
  useUpdateProcDocPo,
} from "@/hooks/use-purchase-order";
import { isApiError } from "@/lib/api";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import type { ProcDocApi as PengadaanProcDocApi } from "@/lib/pengadaan-types";
import type { ProcDocApi, ProcDocPayload } from "@/lib/purchase-order-types";

type FormLine = {
  key: string;
  itemId: string;
  unitId: number | null;
  unitLabel: string;
  qty: string;
  price: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return { key: `L${lineSeq}`, itemId: "", unitId: null, unitLabel: "", qty: "1", price: "" };
};

const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseOrderForm({ mode, id }: { mode: "new" | "edit"; id?: number }) {
  const navigate = useNavigate();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");

  const create = useCreateProcDocPo();
  const update = useUpdateProcDocPo();
  const submit = useSubmitProcDocPo();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: departments, isLoading: departmentsLoading } = useDepartments();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: approvedPrs, isLoading: approvedPrsLoading } = useApprovedProcDocsPr();

  const { data: docDetail } = useProcDocPo(mode === "edit" ? id : undefined);
  const [sourcePrId, setSourcePrId] = useState("");
  const { data: prDetail, isLoading: prDetailLoading } = useProcDocPo(
    sourcePrId ? Number(sourcePrId) : undefined,
  );

  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [sourcedFromPr, setSourcedFromPr] = useState(false);
  const [prSheetOpen, setPrSheetOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);

  const { scanOpen, setScanOpen, readerId } = useWmsScanner({
    items: (items?.data ?? []) as never,
    onPick: (item) => {
      if (scanTarget) pickItem(scanTarget, String(item.id));
    },
  });

  const doc = mode === "edit" ? docDetail?.data : undefined;

  // Prefill saat mode edit: dokumen dimuat dari API (hanya Draft yang bisa diedit).
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (mode === "edit" && doc && !prefilled) {
      setDate((doc.document_date ?? today()).slice(0, 10));
      setSupplierId(doc.supplier_id != null ? String(doc.supplier_id) : "");
      setWarehouseId(doc.warehouse_id != null ? String(doc.warehouse_id) : "");
      setDepartmentId(doc.department_id != null ? String(doc.department_id) : "");
      setReference(doc.reference ?? "");
      setNote(doc.note ?? "");
      setSourcedFromPr(doc.source_proc_doc_id != null);
      setLines(
        (doc.lines ?? []).map((l) => ({
          key: `L${(lineSeq += 1)}`,
          itemId: String(l.item_id),
          unitId: l.unit_id,
          unitLabel: l.unit ?? unitOf(String(l.item_id)).unit,
          qty: String(l.qty),
          price: String(l.price),
        })),
      );
      setPrefilled(true);
    }
  }, [mode, doc, prefilled]);

  // Prefill saat "Buat dari PR Disetujui": isi supplier/gudang/departemen/referensi + baris.
  useEffect(() => {
    if (mode === "new" && sourcePrId && prDetail?.data) {
      const pr = prDetail.data;
      setSupplierId(pr.supplier_id != null ? String(pr.supplier_id) : "");
      setWarehouseId(pr.warehouse_id != null ? String(pr.warehouse_id) : "");
      setDepartmentId(pr.department_id != null ? String(pr.department_id) : "");
      setReference(pr.no);
      setSourcedFromPr(true);
      setLines(
        (pr.lines ?? []).map((l) => ({
          key: `L${(lineSeq += 1)}`,
          itemId: String(l.item_id),
          unitId: l.unit_id,
          unitLabel: l.unit ?? unitOf(String(l.item_id)).unit,
          qty: String(l.qty),
          price: String(l.price),
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePrId, prDetail?.data]);

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => (warehouses?.data ?? []).map((w) => ({ value: String(w.id), label: w.name })),
    [warehouses],
  );

  const supplierOptions: ComboboxOption[] = useMemo(
    () => (suppliers?.data ?? []).map((s) => ({ value: String(s.id), label: s.name })),
    [suppliers],
  );

  const departmentOptions: ComboboxOption[] = useMemo(
    () => (departments?.data ?? []).map((d) => ({ value: String(d.id), label: d.name })),
    [departments],
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

  const prOptions: ComboboxOption[] = useMemo(
    () =>
      (approvedPrs?.data ?? []).map((p) => ({
        value: String(p.id),
        label: `${p.no} · ${p.supplier ?? "—"} · ${p.department ?? ""} · ${formatNumber(p.qty_total ?? 0)} qty`,
        keywords: `${p.no} ${p.supplier ?? ""} ${p.department ?? ""} ${p.requester ?? ""}`,
      })),
    [approvedPrs],
  );

  const unitOf = (itemId: string): { unit_id: number | null; unit: string } => {
    const it = items?.data.find((x) => String(x.id) === itemId);
    return { unit_id: it?.unit_id ?? null, unit: it?.unit ?? "" };
  };

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
    const u = unitOf(itemId);
    patchLine(key, (prev) => ({
      itemId,
      unitId: u.unit_id,
      unitLabel: u.unit,
      price:
        prev.price === "" && !sourcedFromPr
          ? String(items?.data.find((x) => String(x.id) === itemId)?.cost ?? "")
          : prev.price,
    }));
  };

  const totalQty = useMemo(() => lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), [lines]);
  const totalValue = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    [lines],
  );

  const buildPayload = (): ProcDocPayload => ({
    kind: "PO",
    document_date: date || today(),
    department_id: departmentId ? Number(departmentId) : null,
    supplier_id: Number(supplierId),
    warehouse_id: Number(warehouseId),
    reference: reference.trim() || null,
    source_proc_doc_id: sourcedFromPr && sourcePrId ? Number(sourcePrId) : null,
    note: note.trim() || null,
    lines: lines
      .filter((l) => l.itemId && l.qty)
      .map((l) => ({
        item_id: Number(l.itemId),
        qty: Number(l.qty),
        unit_id: l.unitId,
        price: Number(l.price) || 0,
      })),
  });

  const save = async (thenSubmit: boolean) => {
    setApiErrors(undefined);
    if (!supplierId) {
      toast.error("Pilih supplier terlebih dahulu.");
      return;
    }
    if (!warehouseId) {
      toast.error("Pilih gudang tujuan terlebih dahulu.");
      return;
    }
    if (!departmentId) {
      toast.error("Pilih departemen terlebih dahulu.");
      return;
    }
    const payload = buildPayload();
    if (payload.lines.length === 0) {
      toast.error("Lengkapi minimal satu baris barang (barang dan qty).");
      return;
    }

    try {
      let saved = doc;
      if (mode === "new") {
        const res = await create.mutateAsync(payload);
        saved = res.data;
      } else if (doc) {
        const res = await update.mutateAsync({ id: doc.id, payload });
        saved = res.data;
      }
      // PO yang menyalin PR disetujui sudah otomatis Disetujui saat dibuat —
      // tidak perlu dikirim/diajukan lagi.
      if (thenSubmit && saved && saved.status !== "Disetujui") {
        await submit.mutateAsync(saved.id);
        toast.success(`${saved.no} disimpan dan diajukan untuk approval`);
      } else if (saved?.status === "Disetujui") {
        toast.success(`${saved.no} dibuat dan langsung disetujui dari PR`);
      } else {
        toast.success(`Draft ${saved?.no ?? ""} berhasil disimpan`);
      }
      navigate({ to: "/pengadaan/purchase-order" });
    } catch (err) {
      if (isApiError(err)) setApiErrors(err.errors);
      toast.error((err as Error).message);
    }
  };

  const docError = (field: string) => apiErrors?.[field]?.[0];
  const lineError = (index: number, field: string) => apiErrors?.[`lines.${index}.${field}`]?.[0];

  const notDraft = mode === "edit" && doc && doc.status !== "Draft";

  return (
    <>
      <PageHeader
        title={mode === "new" ? "Buat Purchase Order" : `Edit ${doc?.no ?? "Purchase Order"}`}
        description={
          mode === "new" ? "Pesanan pembelian resmi ke supplier" : "Ubah draft Purchase Order"
        }
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/pengadaan/purchase-order">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </Link>
          </Button>
        }
      />

      {notDraft && (
        <Panel title="Tidak dapat diedit">
          <p className="text-sm text-muted-foreground">
            Hanya Purchase Order berstatus Draft yang dapat diubah.
          </p>
        </Panel>
      )}

      {!notDraft && canWrite && (
        <>
          <Panel title="Informasi Dokumen">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nomor Dokumen</Label>
                <Input
                  readOnly
                  value={mode === "edit" ? (doc?.no ?? "") : "PO/2026/#####"}
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
              {mode === "new" && (
                <div className="space-y-1.5">
                  <Label>Buat dari PR Disetujui</Label>
                  <FormCombobox
                    value={sourcePrId}
                    onValueChange={setSourcePrId}
                    options={prOptions}
                    placeholder="Pilih Purchase Request..."
                    searchPlaceholder="Cari no. PR / supplier..."
                    allowEmpty
                    side="bottom"
                    avoidCollisions={false}
                    loading={approvedPrsLoading}
                  />
                  {!sourcePrId && (
                    <p className="text-xs text-muted-foreground">
                      Opsional — pilih PR untuk mengisi otomatis.
                    </p>
                  )}
                  {sourcePrId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPrSheetOpen(true)}
                      disabled={!prDetail?.data}
                    >
                      <Eye className="h-4 w-4" /> Lihat Detail PR
                    </Button>
                  )}
                </div>
              )}

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
                <Label>Gudang Tujuan</Label>
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
                <Label>No. PR</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={sourcedFromPr ? "Diisi otomatis dari PR" : "Contoh: PR/2026/0001"}
                  readOnly={sourcedFromPr}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label>Catatan</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Catatan untuk supplier..."
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
                  {lines.map((l, i) => (
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
                          className="h-9 w-24 rounded-lg"
                        />
                        {lineError(i, "qty") && (
                          <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-sm text-muted-foreground">
                        {l.unitLabel || "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={l.price}
                          readOnly
                          className="h-9 w-32 rounded-lg bg-muted text-muted-foreground"
                        />
                        {lineError(i, "price") && (
                          <p className="mt-1 text-xs text-destructive">{lineError(i, "price")}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-right font-semibold">
                        {formatIDR((Number(l.qty) || 0) * (Number(l.price) || 0))}
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-xl border border-border p-3">
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
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className="h-9 w-24 rounded-lg"
                    />
                    <span className="text-sm text-muted-foreground">{l.unitLabel || "—"}</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={l.price}
                    readOnly
                    placeholder="Harga"
                    className="mt-2 h-9 rounded-lg bg-muted text-muted-foreground"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <b>{formatIDR((Number(l.qty) || 0) * (Number(l.price) || 0))}</b>
                  </div>
                  {lineError(i, "item_id") && (
                    <p className="mt-1 text-xs text-destructive">{lineError(i, "item_id")}</p>
                  )}
                  {lineError(i, "qty") && (
                    <p className="text-xs text-destructive">{lineError(i, "qty")}</p>
                  )}
                  {lineError(i, "price") && (
                    <p className="text-xs text-destructive">{lineError(i, "price")}</p>
                  )}
                  <button
                    type="button"
                    className="mt-1 text-xs text-destructive"
                    onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Total Qty</span>
              <span className="text-right text-lg font-bold">{formatNumber(totalQty)}</span>
              <span className="font-medium">Total Nilai</span>
              <span className="text-right text-lg font-bold">{formatIDR(totalValue)}</span>
            </div>
          </Panel>

          <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur md:bottom-4">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => void save(false)}
              disabled={create.isPending || update.isPending || submit.isPending}
            >
              <Save className="h-4 w-4" /> Simpan Draft
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => setConfirmSubmit(true)}
              disabled={create.isPending || update.isPending || submit.isPending}
            >
              <Send className="h-4 w-4" /> Simpan & Ajukan
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmSubmit} onOpenChange={(o) => !o && setConfirmSubmit(false)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Ajukan Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen akan disimpan lalu berstatus Menunggu Approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" onClick={() => setConfirmSubmit(false)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={(e) => {
                e.preventDefault();
                setConfirmSubmit(false);
                void save(true);
              }}
            >
              <FileDown className="h-4 w-4" /> Ya, Simpan & Ajukan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PurchaseRequestSheet
        doc={prSheetOpen ? ((prDetail?.data ?? null) as unknown as PengadaanProcDocApi) : null}
        isLoading={prSheetOpen && prDetailLoading}
        onOpenChange={setPrSheetOpen}
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
            Mendukung EAN-13, Code 128, dan QR
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
