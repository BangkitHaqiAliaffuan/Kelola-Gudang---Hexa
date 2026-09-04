import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "./kit";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import { useWmsScanner, type ScanMatch } from "@/hooks/use-wms-scanner";
import { ScanDisambiguasiDialog } from "@/components/wms/scan-disambiguasi-dialog";
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
import { useWarehouseFilter } from "@/hooks/use-warehouse-filter";
import { useBins, useItems, useWarehouses } from "@/hooks/use-master";
import { useCreateStockDocument, useStockRows } from "@/hooks/use-persediaan";
import { isApiError } from "@/lib/api";
import { formatNumber } from "@/lib/wms-data";
import type { StockDocumentPayload } from "@/lib/persediaan-types";

type FormLine = {
  key: string;
  itemId: string;
  fromBinId: string;
  toBinId: string;
  qty: string;
};

let lineSeq = 0;
const newLine = (): FormLine => {
  lineSeq += 1;
  return { key: `L${lineSeq}`, itemId: "", fromBinId: "", toBinId: "", qty: "1" };
};

const today = () => new Date().toISOString().slice(0, 10);

export function TransferGudangForm() {
  const navigate = useNavigate();
  const { user, hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");
  const create = useCreateStockDocument();

  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: bins, isLoading: binsLoading } = useBins();
  const { data: stockRows, isLoading: stockLoading } = useStockRows();

  const [warehouseId, setWarehouseId] = useState("");
  // Inisialisasi Gudang dari rantai session (read-only — form tidak menulis balik).
  const whDefaultId = useWarehouseFilter(warehouses?.data).warehouseId;
  useEffect(() => {
    if (whDefaultId == null || warehouseId) return;
    setWarehouseId(String(whDefaultId));
  }, [whDefaultId, warehouseId]);
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [apiErrors, setApiErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [confirmPosting, setConfirmPosting] = useState(false);
  // Set saat submit dimulai: menahan rendering peringatan over-stock selama
  // jendela refetch pasca-posting (invalidateQueries) sebelum navigate selesai.
  const [submitted, setSubmitted] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ code: string; matches: ScanMatch[] } | null>(null);
  const { scanOpen, setScanOpen, readerId } = useWmsScanner({
    items: (items?.data ?? []) as never,
    onPick: (item) => {
      if (scanTarget) pickItem(scanTarget, String(item.id));
    },
    onAmbiguous: (code, matches) => setAmbiguous({ code, matches }),
  });

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => (warehouses?.data ?? []).map((w) => ({ value: String(w.id), label: w.name })),
    [warehouses],
  );

  const destinationOptions: ComboboxOption[] = useMemo(
    () =>
      (warehouses?.data ?? [])
        .filter((w) => String(w.id) !== warehouseId)
        .map((w) => ({ value: String(w.id), label: w.name })),
    [warehouses, warehouseId],
  );

  const binsInWarehouse = useMemo(
    () =>
      warehouseId
        ? (bins?.data ?? []).filter((b) => b.warehouse_id === Number(warehouseId) && b.is_active)
        : [],
    [bins, warehouseId],
  );

  const binsInDestination = useMemo(
    () =>
      destinationId
        ? (bins?.data ?? []).filter((b) => b.warehouse_id === Number(destinationId) && b.is_active)
        : [],
    [bins, destinationId],
  );

  const fromBinOptions: ComboboxOption[] = useMemo(
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

  const toBinOptions: ComboboxOption[] = useMemo(
    () => [
      { value: "", label: "Tanpa Bin — Lantai / Gudang", keywords: "lantai gudang tanpa bin" },
      ...binsInDestination.map((b) => ({
        value: String(b.id),
        label: b.full_address ?? b.name,
        keywords: `${b.code} ${b.rack_name ?? ""}`,
      })),
    ],
    [binsInDestination],
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

  // Ketersediaan per (barang, bin) dari /persediaan/stock; dipakai sebagai
  // peringatan proaktif di gudang asal + penyaringan opsi barang per bin —
  // validasi otoritatif tetap server saat posting.
  const availableByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stockRows?.data ?? [])
      map.set(`${r.warehouse_id}:${r.item_id}:${r.bin_id ?? "NULL"}`, r.available);
    return map;
  }, [stockRows]);

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

  const availableItemIdsByBin = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of stockRows?.data ?? []) {
      if (r.available <= 0 || !r.warehouse_id) continue;
      const binKey = `${r.warehouse_id}:${r.bin_id === null ? "NULL" : String(r.bin_id)}`;
      const set = map.get(binKey) ?? new Set<string>();
      set.add(String(r.item_id));
      map.set(binKey, set);
    }
    return map;
  }, [stockRows]);

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

  const stockedBinIds = useMemo(() => {
    const set = new Set<string>();
    if (!warehouseId) return set;
    for (const r of stockRows?.data ?? []) {
      if (r.available > 0 && r.warehouse_id === Number(warehouseId))
        set.add(r.bin_id === null ? "NULL" : String(r.bin_id));
    }
    return set;
  }, [stockRows, warehouseId]);

  const lineAvailable = (l: FormLine): number => {
    if (!l.itemId || !warehouseId) return 0;
    const binPart = l.fromBinId === "" ? "NULL" : l.fromBinId;
    return availableByKey.get(`${warehouseId}:${l.itemId}:${binPart}`) ?? 0;
  };

  const lineItemOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (!l.fromBinId) {
      if (itemIdsInWarehouse.size === 0) return [];
      return itemOptions.filter((o) => itemIdsInWarehouse.has(o.value));
    }
    const availableIds = availableItemIdsByBin.get(`${warehouseId}:${l.fromBinId}`);
    if (!availableIds) return [];
    return itemOptions.filter((o) => availableIds.has(o.value));
  };

  const lineFromBinOptions = (l: FormLine): ComboboxOption[] => {
    if (!warehouseId) return [];
    if (l.itemId) {
      const candidates = binCandidatesByItem.get(l.itemId) ?? [];
      const ids = new Set(candidates.map((c) => (c.bin_id === null ? "NULL" : String(c.bin_id))));
      return fromBinOptions.filter((o) => ids.has(o.value === "" ? "NULL" : o.value));
    }
    return fromBinOptions.filter((o) => stockedBinIds.has(o.value === "" ? "NULL" : o.value));
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
      const item = items?.data.find((x) => String(x.id) === itemId);
      const candidates = binCandidatesByItem.get(itemId) ?? [];
      const currentValid = Boolean(
        line.fromBinId !== "" &&
        candidates.some(
          (c) => String(c.bin_id ?? "NULL") === (line.fromBinId === "" ? "NULL" : line.fromBinId),
        ),
      );
      if (line.fromBinId !== "" && currentValid) return { itemId };
      if (line.fromBinId === "" && candidates.some((c) => c.bin_id === null)) return { itemId };

      const preferredBin =
        item?.default_bin_id != null && candidates.some((c) => c.bin_id === item.default_bin_id)
          ? String(item.default_bin_id)
          : candidates[0]
            ? candidates[0].bin_id === null
              ? ""
              : String(candidates[0].bin_id)
            : "";

      return { itemId, fromBinId: preferredBin };
    });
  };

  const pickFromBin = (key: string, fromBinId: string) => {
    patchLine(key, (line) => {
      if (line.fromBinId === fromBinId) return {};
      const availableIds = fromBinId ? availableItemIdsByBin.get(fromBinId) : undefined;
      const keepItem = availableIds
        ? Boolean(line.itemId && availableIds.has(line.itemId))
        : Boolean(line.itemId);
      return {
        fromBinId,
        ...(keepItem ? {} : { itemId: "" }),
      };
    });
  };

  const pickSource = (id: string) => {
    setWarehouseId(id);
    if (destinationId === id) setDestinationId("");
    setLines((prev) => prev.map((l) => ({ ...l, fromBinId: "" })));
  };

  const pickDestination = (id: string) => {
    setDestinationId(id);
    setLines((prev) => prev.map((l) => ({ ...l, toBinId: "" })));
  };

  const buildPayload = (status: "Draft" | "Selesai"): StockDocumentPayload => ({
    type: "Transfer Gudang",
    status,
    document_date: date || today(),
    warehouse_id: Number(warehouseId),
    destination_warehouse_id: Number(destinationId),
    partner: null,
    reference_no: reference.trim() || null,
    pic: pic.trim() || null,
    note: note.trim() || null,
    lines: lines
      .filter((l) => l.itemId && l.qty)
      .map((l) => ({
        item_id: Number(l.itemId),
        qty: Number(l.qty),
        from_bin_id: l.fromBinId ? Number(l.fromBinId) : null,
        to_bin_id: l.toBinId ? Number(l.toBinId) : null,
      })),
  });

  const submit = async (status: "Draft" | "Selesai") => {
    setApiErrors(undefined);
    if (!warehouseId || !destinationId) {
      toast.error("Pilih gudang asal dan gudang tujuan terlebih dahulu.");
      return;
    }
    if (warehouseId === destinationId) {
      toast.error("Gudang asal dan tujuan tidak boleh sama.");
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
      toast.error("Ada baris dengan qty melebihi stok tersedia di bin asal.");
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
      navigate({ to: "/transaksi/transfer" });
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
        title="Tambah Transfer Gudang"
        description="Pindahkan stok antar gudang — posting keluar-masuk dilakukan sekaligus"
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/transaksi/transfer">
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
              value="TF/2026/#####"
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
            <Label>Gudang Asal</Label>
            <FormCombobox
              value={warehouseId}
              onValueChange={pickSource}
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
            <Label>Gudang Tujuan</Label>
            <FormCombobox
              value={destinationId}
              onValueChange={pickDestination}
              options={destinationOptions}
              placeholder="Pilih Gudang"
              searchPlaceholder="Cari gudang..."
              side="bottom"
              avoidCollisions={false}
              loading={warehousesLoading}
            />
            {docError("destination_warehouse_id") && (
              <p className="text-xs text-destructive">{docError("destination_warehouse_id")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Referensi</Label>
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
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {["Bin Asal", "Barang", "Qty", "Tersedia", "Bin Tujuan", ""].map((h) => (
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
                    <td className="w-[210px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.fromBinId}
                        onValueChange={(v) => pickFromBin(l.key, v)}
                        options={lineFromBinOptions(l)}
                        placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                        loading={binsLoading}
                      />
                      {lineError(i, "from_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">
                          {lineError(i, "from_bin_id")}
                        </p>
                      )}
                    </td>
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
                          loading={itemsLoading || (Boolean(l.fromBinId) && stockLoading)}
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
                    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-muted-foreground">
                      {available !== undefined ? formatNumber(available) : "—"}
                    </td>
                    <td className="w-[210px] px-3 py-2 align-top">
                      <FormCombobox
                        value={l.toBinId}
                        onValueChange={(v) => patchLine(l.key, { toBinId: v })}
                        options={toBinOptions}
                        placeholder={destinationId ? "Pilih Bin Tujuan" : "Pilih Gudang dulu"}
                        searchPlaceholder="Cari bin / rak..."
                        side="top"
                        avoidCollisions={false}
                        loading={binsLoading}
                      />
                      {lineError(i, "to_bin_id") && (
                        <p className="mt-1 text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                      )}
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
                  <FormCombobox
                    value={l.fromBinId}
                    onValueChange={(v) => pickFromBin(l.key, v)}
                    options={lineFromBinOptions(l)}
                    placeholder={warehouseId ? "Pilih Bin Sumber" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                    loading={binsLoading}
                  />
                  <div className="flex gap-2">
                    <FormCombobox
                      value={l.itemId}
                      onValueChange={(v) => pickItem(l.key, v)}
                      options={lineItemOptions(l)}
                      placeholder="Pilih barang / scan barcode"
                      searchPlaceholder="Cari nama, SKU, barcode..."
                      side="top"
                      avoidCollisions={false}
                      loading={itemsLoading || (Boolean(l.fromBinId) && stockLoading)}
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
                    value={l.toBinId}
                    onValueChange={(v) => patchLine(l.key, { toBinId: v })}
                    options={toBinOptions}
                    placeholder={destinationId ? "Pilih Bin Tujuan" : "Pilih Gudang dulu"}
                    side="top"
                    avoidCollisions={false}
                    loading={binsLoading}
                  />
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
                      Qty melebihi stok tersedia di bin asal.
                    </p>
                  )}
                  {lineError(i, "from_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "from_bin_id")}</p>
                  )}
                  {lineError(i, "to_bin_id") && (
                    <p className="text-xs text-destructive">{lineError(i, "to_bin_id")}</p>
                  )}
                  <div className="flex items-center justify-end text-xs">
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

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Total Qty</span>
          <span className="text-lg font-bold">{formatNumber(totalQty)}</span>
        </div>
      </Panel>

      <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur md:bottom-4">
        {canCreate && (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => submit("Draft")}
            disabled={create.isPending}
          >
            <Save className="h-4 w-4" /> Simpan Draft
          </Button>
        )}
        {canCreate && (
          <Button
            className="rounded-xl"
            onClick={() => setConfirmPosting(true)}
            disabled={create.isPending}
          >
            <Save className="h-4 w-4" /> Simpan & Posting
          </Button>
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

      <ScanDisambiguasiDialog
        open={ambiguous !== null}
        code={ambiguous?.code}
        matches={ambiguous?.matches ?? []}
        onClose={() => setAmbiguous(null)}
        onPick={(item) => {
          if (scanTarget) pickItem(scanTarget, String(item.id));
          setAmbiguous(null);
        }}
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
