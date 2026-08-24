import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, ScanLine, Trash2 } from "lucide-react";
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
import { useBins, useItems, useWarehouses } from "@/hooks/use-master";
import { useCreateStockDocument, useStockRows } from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatNumber } from "@/lib/wms-data";
import { opnameReasonCodes, type StockDocumentPayload } from "@/lib/persediaan-types";

type Direction = "in" | "out";

type FormLine = {
  key: string;
  itemId: string;
  binId: string;
  direction: Direction;
  qty: string;
  reason: string;
  note: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return {
    key: `L${lineSeq}`,
    itemId: "",
    binId: "",
    direction: "in",
    qty: "1",
    reason: "",
    note: "",
  };
};

const today = () => new Date().toISOString().slice(0, 10);

export function StockAdjustmentForm() {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: bins, isLoading: binsLoading } = useBins();
  const { data: stockRows, isLoading: stockLoading } = useStockRows();

  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(today());
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);

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

  const reasonOptions: ComboboxOption[] = useMemo(
    () =>
      Object.entries(opnameReasonCodes).map(([value, label]) => ({
        value,
        label,
        keywords: label,
      })),
    [],
  );

  // Ketersediaan per (barang, bin) dari /persediaan/stock; dipakai untuk arah
  // "kurangi" (OUT): peringatan proaktif + penyaringan opsi — validasi otoritatif
  // tetap server saat posting.
  const availableByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stockRows?.data ?? [])
      map.set(`${r.item_id}:${r.bin_id ?? "NULL"}`, r.available);
    return map;
  }, [stockRows]);

  const availableItemIdsByBin = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of stockRows?.data ?? []) {
      if (r.stock <= 0) continue;
      const binKey = r.bin_id === null ? "NULL" : String(r.bin_id);
      const set = map.get(binKey) ?? new Set<string>();
      set.add(String(r.item_id));
      map.set(binKey, set);
    }
    return map;
  }, [stockRows]);

  // Bin-bin yang benar-benar berisi stok di gudang terpilih — cakupan dropdown
  // bin untuk arah "kurangi" (OUT) agar operator tidak diganggu bin kosong.
  const stockedBinIds = useMemo(() => {
    const set = new Set<string>();
    if (!warehouseId) return set;
    for (const r of stockRows?.data ?? []) {
      if (r.stock > 0 && r.warehouse_id === Number(warehouseId))
        set.add(r.bin_id === null ? "NULL" : String(r.bin_id));
    }
    return set;
  }, [stockRows, warehouseId]);

  // Kandidat bin per barang di gudang terpilih (berisi stok), diurutkan
  // available desc — dasar auto-suggest bin untuk arah "kurangi".
  const binCandidatesByItem = useMemo(() => {
    const map = new Map<string, { bin_id: number | null; available: number }[]>();
    if (!warehouseId) return map;
    for (const r of stockRows?.data ?? []) {
      if (r.stock <= 0 || r.warehouse_id !== Number(warehouseId)) continue;
      const list = map.get(String(r.item_id)) ?? [];
      list.push({ bin_id: r.bin_id, available: r.available });
      map.set(String(r.item_id), list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.available - a.available || (a.bin_id ?? -1) - (b.bin_id ?? -1));
    }
    return map;
  }, [stockRows, warehouseId]);

  const lineAvailable = (l: FormLine): number | undefined => {
    if (!l.itemId) return undefined;
    // Opsi A: binId "" = lantai
    if (l.binId === "" && l.direction === "out") return availableByKey.get(`${l.itemId}:NULL`);
    if (!l.binId) return undefined;
    return availableByKey.get(`${l.itemId}:${l.binId}`);
  };

  const hasStockInWarehouse = (l: FormLine): boolean =>
    !l.itemId || (binCandidatesByItem.get(l.itemId)?.length ?? 0) > 0;

  // Barang: untuk OUT semua opsi yang berisi stok di bin terpilih; untuk IN semua.
  const lineItemOptions = (l: FormLine): ComboboxOption[] => {
    if (l.direction === "out" && l.binId) {
      const availableIds = availableItemIdsByBin.get(l.binId);
      if (!availableIds) return [];
      return itemOptions.filter((o) => availableIds.has(o.value));
    }
    return itemOptions;
  };

  // Bin: untuk OUT hanya bin berisi stok (scoped ke barang terpilih bila ada);
  // untuk IN semua bin aktif di gudang (penambahan boleh ke bin kosong).
  const lineBinOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (l.direction === "out") {
      if (l.itemId) {
        const candidates = binCandidatesByItem.get(l.itemId) ?? [];
        const ids = new Set(candidates.map((c) => (c.bin_id === null ? "NULL" : String(c.bin_id))));
        return binOptions.filter((o) => ids.has(o.value === "" ? "NULL" : o.value));
      }
      return binOptions.filter((o) => stockedBinIds.has(o.value === "" ? "NULL" : o.value));
    }
    return binOptions;
  };

  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0), [lines]);

  const missingReasonCount = useMemo(
    () => lines.filter((l) => l.itemId && !l.reason).length,
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

  const binValidFor = (l: FormLine, binId: string): boolean => {
    if (!warehouseId || !binId) return false;
    if (l.direction === "out") {
      const candidates = binCandidatesByItem.get(l.itemId ?? "") ?? [];
      return candidates.some((c) => c.bin_id === Number(binId));
    }
    return binsInWarehouse.some((b) => String(b.id) === binId);
  };

  const pickItem = (key: string, itemId: string) => {
    patchLine(key, (line) => {
      const item = items?.data.find((x) => String(x.id) === itemId);
      let binId = line.binId;

      if (line.direction === "out") {
        const candidates = binCandidatesByItem.get(itemId) ?? [];
        const currentValid = Boolean(binId && candidates.some((c) => c.bin_id === Number(binId)));
        if (!currentValid) {
          binId =
            item?.default_bin_id != null && candidates.some((c) => c.bin_id === item.default_bin_id)
              ? String(item.default_bin_id)
              : candidates[0]
                ? String(candidates[0].bin_id)
                : "";
        }
      } else if (binId && !binValidFor({ ...line, itemId }, binId)) {
        binId = item?.default_bin_id != null ? String(item.default_bin_id) : "";
      }

      return { itemId, binId };
    });
  };

  const pickBin = (key: string, binId: string) => patchLine(key, { binId });

  const setDirection = (key: string, direction: Direction) => {
    patchLine(key, (line) => {
      const binId = binValidFor({ ...line, direction }, line.binId) ? line.binId : "";
      return { direction, binId };
    });
  };

  const pickWarehouse = (id: string) => {
    setWarehouseId(id);
    setLines((prev) => prev.map((l) => ({ ...l, binId: "" })));
  };

  const buildPayload = (status: "Draft" | "Selesai"): StockDocumentPayload => ({
    type: "Stock Adjustment",
    status,
    document_date: date || today(),
    warehouse_id: Number(warehouseId),
    partner: null,
    reference_no: null,
    pic: pic.trim() || null,
    note: note.trim() || null,
    lines: lines
      .filter((l) => l.itemId && l.qty)
      .map((l) => {
        const qty = Math.abs(Number(l.qty) || 0);
        const signed = l.direction === "out" ? -qty : qty;
        const binVal = l.binId ? Number(l.binId) : null;
        return {
          item_id: Number(l.itemId),
          qty: signed,
          ...(l.direction === "out" ? { from_bin_id: binVal } : { to_bin_id: binVal }),
          reason_code: l.reason.trim() || null,
          note: l.note.trim() || null,
        };
      }),
  });

  const submit = async (status: "Draft" | "Selesai") => {
    setApiErrors(undefined);
    if (!warehouseId) {
      toast.error("Pilih gudang terlebih dahulu.");
      return;
    }

    const filled = lines.filter((l) => l.itemId && l.qty);
    if (filled.length === 0) {
      toast.error("Lengkapi minimal satu baris (barang, arah, qty, dan alasan).");
      return;
    }

    if (missingReasonCount > 0) {
      toast.error(`Alasan selisih wajib diisi untuk ${missingReasonCount} baris.`);
      return;
    }

    const overLine = lines.find((l) => {
      if (l.direction !== "out" || !l.itemId || !l.binId || !l.qty) return false;
      const available = lineAvailable(l);
      return available !== undefined && Math.abs(Number(l.qty)) > available;
    });
    if (overLine) {
      toast.error("Ada baris pengurangan dengan qty melebihi stok tersedia di bin terpilih.");
      return;
    }

    const payload = buildPayload(status);

    try {
      const res = await create.mutateAsync(payload);
      toast.success(
        status === "Selesai"
          ? `Dokumen ${res.data.no} berhasil diposting`
          : `Draft ${res.data.no} berhasil disimpan`,
      );
      navigate({ to: "/persediaan/adjustment" });
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
        title="Tambah Stock Adjustment"
        description="Koreksi selisih stok fisik vs sistem — tambahkan atau kurangi stok di lokasi tertentu"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/persediaan/adjustment">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </Link>
          </Button>
        }
      />

      <Panel title="Informasi Dokumen">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Nomor Dokumen</Label>
            <Input
              readOnly
              value="ADJ/2026/#####"
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
            <Label>PIC</Label>
            <Input value={pic} onChange={(e) => setPic(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label>Catatan</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan tambahan (mis. acuan bukti fisik)..."
              className="rounded-xl"
              rows={2}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Daftar Barang"
        description="Arah tambah (+) menambah stok ke bin tujuan; arah kurangi (−) mengurangi stok dari bin asal. Alasan selisih wajib diisi setiap baris."
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
                {["Barang", "Bin", "Arah", "Qty", "Tersedia", "Alasan", ""].map((h) => (
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
                  l.direction === "out" &&
                  available !== undefined &&
                  Math.abs(Number(l.qty) || 0) > available;
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="w-[280px] px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <FormCombobox
                          value={l.itemId}
                          onValueChange={(v) => pickItem(l.key, v)}
                          options={lineItemOptions(l)}
                          placeholder="Pilih barang / scan barcode"
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
                    <td className="w-[200px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.binId}
                        onValueChange={(v) => pickBin(l.key, v)}
                        options={lineBinOptions(l)}
                        placeholder={
                          warehouseId
                            ? l.direction === "out"
                              ? "Pilih Bin Asal"
                              : "Pilih Bin Tujuan"
                            : "Pilih Gudang dulu"
                        }
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                        loading={binsLoading || stockLoading}
                      />
                      {l.direction === "out" && l.itemId && !hasStockInWarehouse(l) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Stok tidak tersedia di gudang ini.
                        </p>
                      )}
                      {lineError(i, "from_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">
                          {lineError(i, "from_bin_id")}
                        </p>
                      )}
                      {lineError(i, "to_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                      )}
                    </td>
                    <td className="w-[150px] px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={l.direction === "in" ? "default" : "outline"}
                          className="h-9 flex-1 rounded-lg text-xs"
                          onClick={() => setDirection(l.key, "in")}
                        >
                          + Tambah
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={l.direction === "out" ? "default" : "outline"}
                          className="h-9 flex-1 rounded-lg text-xs"
                          onClick={() => setDirection(l.key, "out")}
                        >
                          − Kurangi
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                        className={`h-9 w-20 rounded-lg ${overStock ? "border-destructive" : ""}`}
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
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {l.direction === "out" && available !== undefined
                        ? formatNumber(available)
                        : "—"}
                    </td>
                    <td className="w-[190px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.reason}
                        onValueChange={(v) => patchLine(l.key, { reason: v })}
                        options={reasonOptions}
                        placeholder="Pilih alasan"
                        searchPlaceholder="Cari alasan..."
                        side="top"
                        avoidCollisions={false}
                      />
                      {l.itemId && !l.reason && (
                        <p className="mt-1 text-xs text-amber-600">Alasan wajib diisi.</p>
                      )}
                      {lineError(i, "reason_code") && (
                        <p className="mt-1 text-xs text-destructive">
                          {lineError(i, "reason_code")}
                        </p>
                      )}
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
            const overStock =
              l.direction === "out" &&
              available !== undefined &&
              Math.abs(Number(l.qty) || 0) > available;
            return (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <FormCombobox
                      value={l.itemId}
                      onValueChange={(v) => pickItem(l.key, v)}
                      options={lineItemOptions(l)}
                      placeholder="Pilih barang / scan barcode"
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
                  <FormCombobox
                    value={l.binId}
                    onValueChange={(v) => pickBin(l.key, v)}
                    options={lineBinOptions(l)}
                    placeholder={warehouseId ? "Pilih Bin" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                    loading={binsLoading || stockLoading}
                  />
                  {l.direction === "out" && l.itemId && !hasStockInWarehouse(l) && (
                    <p className="text-xs text-muted-foreground">
                      Stok tidak tersedia di gudang ini.
                    </p>
                  )}
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={l.direction === "in" ? "default" : "outline"}
                      className="h-9 flex-1 rounded-lg text-xs"
                      onClick={() => setDirection(l.key, "in")}
                    >
                      + Tambah
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={l.direction === "out" ? "default" : "outline"}
                      className="h-9 flex-1 rounded-lg text-xs"
                      onClick={() => setDirection(l.key, "out")}
                    >
                      − Kurangi
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      className={`h-9 w-24 rounded-lg ${overStock ? "border-destructive" : ""}`}
                    />
                    <span className="ml-auto text-sm text-muted-foreground">
                      {l.direction === "out" && available !== undefined
                        ? `Tersedia ${formatNumber(available)}`
                        : "—"}
                    </span>
                  </div>
                  {overStock && (
                    <p className="text-xs text-destructive">
                      Qty melebihi stok tersedia di bin ini.
                    </p>
                  )}
                  <FormCombobox
                    value={l.reason}
                    onValueChange={(v) => patchLine(l.key, { reason: v })}
                    options={reasonOptions}
                    placeholder="Alasan selisih"
                    side="top"
                    avoidCollisions={false}
                  />
                  {l.itemId && !l.reason && (
                    <p className="text-xs text-amber-600">Alasan wajib diisi.</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span
                      className="text-destructive"
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    >
                      {lines.length > 1 ? "Hapus" : ""}
                    </span>
                  </div>
                  {lineError(i, "qty") && (
                    <p className="text-xs text-destructive">{lineError(i, "qty")}</p>
                  )}
                  {lineError(i, "reason_code") && (
                    <p className="text-xs text-destructive">{lineError(i, "reason_code")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Total Qty (abs)</span>
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
            <AlertDialogTitle>Posting dokumen penyesuaian?</AlertDialogTitle>
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
          <div id={readerId} className="min-h-[280px] overflow-hidden rounded-xl border border-border bg-black" />
          <p className="text-center text-xs text-muted-foreground">Mendukung EAN-13, Code 128, dan QR</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
