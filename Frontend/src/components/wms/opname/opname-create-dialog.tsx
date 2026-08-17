import { useMemo, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormCombobox } from "@/components/wms/form-combobox";
import { EmptyState } from "@/components/wms/kit";
import { useAuth } from "@/hooks/use-auth";
import { useUsers, useWarehouses } from "@/hooks/use-master";
import { useCreateStockDocument, useStockRows } from "@/hooks/use-persediaan";
import { formatNumber } from "@/lib/wms-data";
import { isApiError } from "@/lib/api";

export function OpnameCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stockRows, isLoading: stockLoading } = useStockRows();
  const create = useCreateStockDocument();

  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pic, setPic] = useState(user?.name ?? "");
  const [note, setNote] = useState("");
  const [blindCount, setBlindCount] = useState(true);

  const whId = warehouseId ? Number(warehouseId) : null;

  const warehouseRows = useMemo(
    () => (stockRows?.data ?? []).filter((r) => whId != null && r.warehouse_id === whId),
    [stockRows, whId],
  );

  const canSubmit =
    whId != null && date.length > 0 && warehouseRows.length > 0 && !create.isPending;

  const submit = () => {
    if (!canSubmit || whId == null) return;

    create.mutate(
      {
        type: "Stock Opname",
        status: "Draft",
        document_date: date,
        warehouse_id: whId,
        partner: null,
        reference_no: null,
        pic: pic.trim() || null,
        note: note.trim() || null,
        blind_count: blindCount,
        lines: warehouseRows.map((r) => ({
          item_id: r.item_id,
          from_bin_id: r.bin_id,
          unit_cost: r.unit_cost_avg,
        })),
      },
      {
        onSuccess: () => {
          toast.success("Jadwal opname dibuat");
          onOpenChange(false);
          setWarehouseId("");
          setPic(user?.name ?? "");
          setNote("");
          setDate(new Date().toISOString().slice(0, 10));
        },
        onError: (err) => {
          toast.error(isApiError(err) ? err.message : "Gagal membuat jadwal opname");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle>Buat Jadwal Opname</DialogTitle>
          <DialogDescription>
            Jadwal opname mencakup seluruh stok per rak/bin di gudang yang dipilih. Stok sistem
            di-snapshot saat jadwal dibuat dan pergerakan stok setelahnya akan terdeteksi saat
            penyelesaian.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Gudang</Label>
              <FormCombobox
                value={warehouseId}
                onValueChange={setWarehouseId}
                options={
                  warehouses?.data.map((w) => ({ value: String(w.id), label: w.name })) ?? []
                }
                placeholder="Pilih gudang..."
                searchPlaceholder="Cari gudang..."
                loading={warehousesLoading}
                className="w-full justify-between rounded-xl"
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
            </div>
            <div className="space-y-1.5">
              <Label>PIC</Label>
              <FormCombobox
                value={pic}
                onValueChange={setPic}
                options={
                  (users?.data ?? [])
                    .filter((u) => u.is_active)
                    .map((u) => ({ value: u.name, label: u.name })) ?? []
                }
                placeholder="Pilih penanggung jawab..."
                searchPlaceholder="Cari nama..."
                loading={usersLoading}
                className="w-full justify-between rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Misal: opname akhir bulan"
                className="rounded-xl"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
            <Checkbox
              checked={blindCount}
              onCheckedChange={(v) => setBlindCount(v !== false)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Blind count</span>
              <span className="block text-xs text-muted-foreground">
                Sembunyikan jumlah sistem & selisih saat pencatatan fisik — petugas menghitung tanpa
                tahu angka sistem. Kolom sistem muncul kembali saat menyelesaikan opname.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <p className="text-xs font-semibold text-muted-foreground">Pratinjau Cakupan</p>
              {whId != null &&
                (stockLoading ? (
                  <span className="text-xs text-muted-foreground">Memuat stok...</span>
                ) : (
                  <span className="text-xs font-semibold">
                    {formatNumber(warehouseRows.length)} baris stok
                  </span>
                ))}
            </div>
            {whId == null ? (
              <div className="p-4">
                <EmptyState
                  title="Pilih gudang dulu"
                  description="Cakupan opname dihitung dari stok per rak/bin gudang yang dipilih."
                />
              </div>
            ) : stockLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat data stok...
              </div>
            ) : warehouseRows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Tidak ada stok"
                  description="Gudang ini belum memiliki baris stok — pilih gudang lain."
                />
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {warehouseRows.map((r) => (
                  <div
                    key={`${r.item_id}-${r.bin_id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.name ?? "—"}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          ({r.sku ?? "—"})
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Rak {r.rack ?? "—"} · Bin {r.bin ?? "—"}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-muted-foreground">Stok sistem</p>
                      <b>{formatNumber(r.stock)}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Batal
          </Button>
          <Button
            className="rounded-xl"
            onClick={submit}
            disabled={!canSubmit}
            title={warehouseRows.length === 0 ? "Gudang belum memiliki baris stok" : undefined}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarDays className="h-4 w-4" />
            )}
            Buat Jadwal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
