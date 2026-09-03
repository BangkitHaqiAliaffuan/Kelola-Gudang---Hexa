import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "./kit";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import { Button } from "@/components/ui/button";
import { useWmsScanner } from "@/hooks/use-wms-scanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useBins,
  useCustomers,
  useDepartments,
  useItems,
  useProjects,
  useWarehouses,
} from "@/hooks/use-master";
import { useCreateStockDocument, useStockRows } from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatIDR, formatNumber } from "@/lib/wms-data";
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
  return { key: `L${lineSeq}`, itemId: "", binId: "", qty: "1", cost: "0" };
};

const today = () => new Date().toISOString().slice(0, 10);

export function BarangKeluarForm() {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: departments, isLoading: departmentsLoading } = useDepartments();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: bins, isLoading: binsLoading } = useBins();
  const { data: stockRows, isLoading: stockLoading } = useStockRows();

  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (warehousesLoading) return;
    const def = user?.default_warehouse_id;
    if (!def || warehouseId) return;
    if (!(warehouses?.data ?? []).some((w) => w.id === def)) return;
    setWarehouseId(String(def));
  }, [warehousesLoading, warehouses, user, warehouseId]);
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  // Set saat submit dimulai: menahan rendering peringatan over-stock selama
  // jendela refetch pasca-posting (invalidateQueries) sebelum navigate selesai.
  const [submitted, setSubmitted] = useState(false);

  const { scanOpen, setScanOpen, readerId } = useWmsScanner({
    items: (items?.data ?? []) as never,
    onPick: (item) => {
      if (scanTarget) pickItem(scanTarget, String(item.id));
    },
  });

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

  // Tujuan: gabung 3 master tapi hindari collision nama — value di-prefix dengan tipe,
  // label dibedakan. customer:12 vs department:5 dengan nama sama tidak tabrakan.
  const purposeOptions: ComboboxOption[] = useMemo(() => {
    const opts: ComboboxOption[] = [];
    for (const c of customers?.data ?? [])
      opts.push({ value: `customer:${c.id}`, label: `${c.name} — Customer`, keywords: c.name });
    for (const d of departments?.data ?? [])
      opts.push({ value: `department:${d.id}`, label: `${d.name} — Departemen`, keywords: d.name });
    for (const p of projects?.data ?? [])
      opts.push({ value: `project:${p.id}`, label: `${p.name} — Proyek`, keywords: p.name });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [customers, departments, projects]);

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

  // Ketersediaan per (barang, bin, gudang) dari /persediaan/stock; dipakai sebagai
  // peringatan proaktif + penyaringan opsi barang per gudang/bin — validasi
  // otoritatif tetap server saat posting. Gudang dipilih wajib, barang hanya
  // menampilkan item yang punya stok di gudang tersebut.
  const availableByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stockRows?.data ?? [])
      map.set(`${r.warehouse_id}:${r.item_id}:${r.bin_id ?? "NULL"}`, r.available);
    return map;
  }, [stockRows]);

  // Item IDs yang punya stok >0 di gudang terpilih — untuk filter barang per gudang.
  const itemIdsInWarehouse = useMemo(() => {
    const set = new Set<string>();
    if (!warehouseId) return set;
    const wid = Number(warehouseId);
    for (const r of stockRows?.data ?? []) {
      if (r.available <= 0 || r.warehouse_id !== wid) continue;
      set.add(String(r.item_id));
    }
    return set;
  }, [stockRows, warehouseId]);

  // Bin-bin yang benar-benar berisi stok di gudang terpilih — dipakai sebagai
  // scope dropdown bin agar operator tidak diganggu 72 bin kosong.
  const stockedBinIds = useMemo(() => {
    const set = new Set<string>();
    if (!warehouseId) return set;
    for (const r of stockRows?.data ?? []) {
      if (r.available > 0 && r.warehouse_id === Number(warehouseId))
        set.add(r.bin_id === null ? "NULL" : String(r.bin_id));
    }
    return set;
  }, [stockRows, warehouseId]);

  // Kandidat bin per barang di gudang terpilih, diurutkan available desc —
  // dasar auto-suggest bin saat barang dipilih.
  const binCandidatesByItem = useMemo(() => {
    const map = new Map<string, { bin_id: number | null; available: number }[]>();
    if (!warehouseId) return map;
    for (const r of stockRows?.data ?? []) {
      if (r.available <= 0 || r.warehouse_id !== Number(warehouseId)) continue;
      const list = map.get(String(r.item_id)) ?? [];
      list.push({ bin_id: r.bin_id, available: r.available });
      map.set(String(r.item_id), list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.available - a.available || (a.bin_id ?? -1) - (b.bin_id ?? -1));
    }
    return map;
  }, [stockRows, warehouseId]);

  const lineAvailable = (l: FormLine): number => {
    if (!l.itemId || !warehouseId) return 0;
    const binPart = l.binId === "" ? "NULL" : l.binId;
    return availableByKey.get(`${warehouseId}:${l.itemId}:${binPart}`) ?? 0;
  };

  const lineItemOptions = (): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (itemIdsInWarehouse.size === 0) return [];
    return itemOptions.filter((o) => itemIdsInWarehouse.has(o.value));
  };

  // Dropdown bin scoped: hanya bin berisi stok di gudang ini; saat barang sudah
  // dipilih, hanya bin yang memegang barang tersebut (berisi stok).
  const lineBinOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (l.itemId) {
      const candidates = binCandidatesByItem.get(l.itemId) ?? [];
      const ids = new Set(candidates.map((c) => (c.bin_id === null ? "NULL" : String(c.bin_id))));
      return binOptions.filter((o) => ids.has(o.value === "" ? "NULL" : o.value));
    }
    return binOptions.filter((o) => stockedBinIds.has(o.value === "" ? "NULL" : o.value));
  };

  const hasStockInWarehouse = (l: FormLine): boolean =>
    !l.itemId || (binCandidatesByItem.get(l.itemId)?.length ?? 0) > 0;

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0), [lines]);
  const totalNilai = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0),
    [lines],
  );

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
      const item = items?.data.find((x) => String(x.id) === itemId);
      const candidates = binCandidatesByItem.get(itemId) ?? [];
      const currentValid = Boolean(
        line.binId !== "" &&
        candidates.some(
          (c) => String(c.bin_id ?? "NULL") === (line.binId === "" ? "NULL" : line.binId),
        ),
      );
      const costVal = item ? String(item.cost ?? 0) : "";
      // Jika sudah ada bin (termasuk lantai "") dan valid, pertahankan bin tapi update cost
      if (line.binId !== "" && currentValid) return { itemId, cost: costVal };
      if (line.binId === "" && candidates.some((c) => c.bin_id === null))
        return { itemId, cost: costVal };
      const preferredBin =
        item?.default_bin_id != null && candidates.some((c) => c.bin_id === item.default_bin_id)
          ? String(item.default_bin_id)
          : candidates[0]
            ? candidates[0].bin_id === null
              ? ""
              : String(candidates[0].bin_id)
            : "";
      return { itemId, binId: preferredBin, cost: costVal };
    });
  };

  const pickBin = (key: string, binId: string) => patchLine(key, { binId });

  const pickWarehouse = (id: string) => {
    setWarehouseId(id);
    setLines((prev) => prev.map((l) => ({ ...l, binId: "" })));
  };

  const buildPayload = (status: "Draft" | "Selesai"): StockDocumentPayload => {
    let cid: number | null = null;
    let partnerName: string | null = null;
    if (purpose) {
      if (purpose.startsWith("customer:")) {
        cid = Number(purpose.split(":")[1] ?? "");
        partnerName = customers?.data.find((c) => String(c.id) === String(cid))?.name ?? null;
      } else if (purpose.startsWith("department:")) {
        const did = purpose.split(":")[1];
        partnerName = departments?.data.find((d) => String(d.id) === did)?.name ?? null;
      } else if (purpose.startsWith("project:")) {
        const pid = purpose.split(":")[1];
        partnerName = projects?.data.find((p) => String(p.id) === pid)?.name ?? null;
      } else {
        // fallback legacy string (seharusnya tidak terjadi)
        partnerName = purpose;
        cid = customers?.data.find((c) => c.name === purpose)?.id ?? null;
      }
    }
    return {
      type: "Pengeluaran",
      status,
      document_date: date || today(),
      warehouse_id: Number(warehouseId),
      customer_id: cid,
      partner: partnerName,
      reference_no: reference.trim() || null,
      pic: pic.trim() || null,
      note: note.trim() || null,
      lines: lines
        .filter((l) => l.itemId && l.qty)
        .map((l) => ({
          item_id: Number(l.itemId),
          qty: Number(l.qty),
          from_bin_id: l.binId ? Number(l.binId) : null,
        })),
    };
  };

  const submit = async (status: "Draft" | "Selesai") => {
    setApiErrors(undefined);
    if (!warehouseId) {
      toast.error("Pilih gudang terlebih dahulu.");
      return;
    }
    if (!purpose.trim()) {
      toast.error("Pilih tujuan terlebih dahulu.");
      return;
    }
    const payload = buildPayload(status);
    if (payload.lines.length === 0) {
      toast.error("Lengkapi minimal satu baris barang (barang dan qty).");
      return;
    }

    const overLine = lines.find((l) => {
      if (!l.itemId || !l.qty) return false;
      const available = lineAvailable(l);
      return available !== undefined && Number(l.qty) > available;
    });
    if (overLine) {
      toast.error("Ada baris dengan qty melebihi stok tersedia di bin terpilih.");
      return;
    }

    setSubmitted(true);
    try {
      const res = await create.mutateAsync(payload);
      toast.success(
        status === "Selesai"
          ? `Dokumen ${res.data.no} berhasil diposting`
          : `Draft ${res.data.no} berhasil disimpan`,
      );
      navigate({ to: "/transaksi/keluar" });
    } catch (err) {
      setSubmitted(false);
      if (isApiError(err)) setApiErrors(err.errors);
      toast.error((err as Error).message);
    }
  };

  const docError = (field: string) => apiErrors?.[field]?.[0];
  const lineError = (index: number, field: string) => apiErrors?.[`lines.${index}.${field}`]?.[0];

  return (
    <>
      <PageHeader
        title="Tambah Barang Keluar"
        description="Catat pengeluaran barang ke customer, produksi, departemen, atau proyek"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/transaksi/keluar">
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
              value="BK/2026/#####"
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
            <Label>
              Tujuan <span className="text-destructive">*</span>
            </Label>
            <FormCombobox
              value={purpose}
              onValueChange={setPurpose}
              options={purposeOptions}
              placeholder="Customer / Departemen / Proyek"
              searchPlaceholder="Cari tujuan..."
              side="bottom"
              avoidCollisions={false}
              loading={customersLoading || departmentsLoading || projectsLoading}
            />
            {docError("partner") && (
              <p className="text-xs text-destructive">{docError("partner")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Referensi (SO / SPK / DO)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Contoh: SPK-2026-089"
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
          canCreate && (
            <Button
              size="sm"
              className="rounded-lg"
              onClick={() => setLines((p) => [...p, newLine()])}
            >
              <Plus className="h-4 w-4" /> Tambah Baris
            </Button>
          )
        }
        bodyClassName="p-0"
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {["Barang", "Asal Bin", "Qty", "Harga", "Subtotal", "Tersedia", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const available = lineAvailable(l);
                const overStock =
                  !submitted && available !== undefined && (Number(l.qty) || 0) > available;
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="w-[320px] px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <FormCombobox
                          value={l.itemId}
                          onValueChange={(v) => pickItem(l.key, v)}
                          options={lineItemOptions()}
                          placeholder={
                            warehouseId ? "Pilih barang / scan barcode" : "Pilih Gudang dulu"
                          }
                          searchPlaceholder="Cari nama, SKU, barcode..."
                          side="top"
                          avoidCollisions={false}
                          loading={itemsLoading || stockLoading}
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
                    <td className="w-[220px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.binId}
                        onValueChange={(v) => pickBin(l.key, v)}
                        options={lineBinOptions(l)}
                        placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                        loading={binsLoading || stockLoading}
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
                        className={`h-9 w-24 rounded-lg ${overStock ? "border-destructive" : ""}`}
                      />
                      {lineError(i, "qty") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "qty")}</p>
                      )}
                      {overStock && (
                        <p className="mt-1 text-xs text-destructive">
                          Melebihi tersedia ({formatNumber(available)})
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        value={l.cost}
                        readOnly
                        className="h-9 w-28 rounded-lg bg-muted text-muted-foreground"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm font-semibold">
                      {formatIDR((Number(l.qty) || 0) * (Number(l.cost) || 0))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {available !== undefined ? formatNumber(available) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {canCreate && (
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
                      )}
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
            const overStock =
              !submitted && available !== undefined && (Number(l.qty) || 0) > available;
            return (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <FormCombobox
                      value={l.itemId}
                      onValueChange={(v) => pickItem(l.key, v)}
                      options={lineItemOptions()}
                      placeholder={
                        warehouseId ? "Pilih barang / scan barcode" : "Pilih Gudang dulu"
                      }
                      side="top"
                      avoidCollisions={false}
                      loading={itemsLoading || stockLoading}
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
                  <FormCombobox
                    value={l.binId}
                    onValueChange={(v) => pickBin(l.key, v)}
                    options={lineBinOptions(l)}
                    placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                    loading={binsLoading || stockLoading}
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
                      className={`h-9 w-24 rounded-lg ${overStock ? "border-destructive" : ""}`}
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Harga</span>
                    <Input
                      type="number"
                      min={0}
                      value={l.cost}
                      readOnly
                      className="h-9 w-28 rounded-lg bg-muted text-muted-foreground"
                    />
                    <span className="ml-auto text-sm font-semibold">
                      {formatIDR((Number(l.qty) || 0) * (Number(l.cost) || 0))}
                    </span>
                  </div>
                  {lineError(i, "from_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "from_bin_id")}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{lines.length === 1 ? "" : ""}</span>
                    {canCreate && (
                      <button
                        type="button"
                        className="text-destructive"
                        onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                        disabled={lines.length === 1}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1 border-t border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total Qty</span>
            <span className="text-sm font-bold">{formatNumber(totalQty)} PCS</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Grand Total Nilai</span>
            <span className="text-lg font-bold">{formatIDR(totalNilai)}</span>
          </div>
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
