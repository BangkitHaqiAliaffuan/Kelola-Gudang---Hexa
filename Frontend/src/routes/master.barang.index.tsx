import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, ItemThumb, FilterSelect, ALL } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { ItemFormDialog } from "@/components/wms/master-forms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatIDR, formatNumber } from "@/lib/wms-data";
import {
  useBulkDeleteItems,
  useBulkUpdateItemStatus,
  useCategories,
  useDeleteItem,
  useItems,
  useMerks,
  useSubCategories,
} from "@/hooks/use-master";
import type { ItemApi } from "@/lib/master-types";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/master/barang/")({
  head: () => ({
    meta: [
      { title: "Master Barang — KelolaGudang" },
      {
        name: "description",
        content: "Kelola data barang: SKU, barcode, kategori, stok, dan harga.",
      },
      { property: "og:title", content: "Master Barang — KelolaGudang" },
      { property: "og:description", content: "Daftar lengkap barang gudang dengan filter cepat." },
    ],
  }),
  component: MasterBarang,
});

const stockStatus = (it: { stock: number; min: number; max: number | null }) =>
  it.stock === 0
    ? { label: "Habis", tone: "danger" as const }
    : it.stock <= it.min
      ? { label: "Menipis", tone: "warning" as const }
      : it.max != null && it.stock >= it.max
        ? { label: "Overstock", tone: "info" as const }
        : { label: "Normal", tone: "success" as const };

const hueFor = (id: number) => (id * 137) % 360;

function MasterBarang() {
  const navigate = useNavigate();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Master Data", "Tulis");
  const canDelete = hasModuleLevel("Master Data", "Kelola");
  const { data, isLoading } = useItems();
  const { data: cats } = useCategories();
  const { data: subs } = useSubCategories();
  const { data: merks } = useMerks();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [cat, setCat] = useState(ALL);
  const [subCat, setSubCat] = useState(ALL);
  const [brand, setBrand] = useState(ALL);
  const [stockF, setStockF] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selected, setSelected] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ItemApi | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemApi | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusValue, setStatusValue] = useState<"Aktif" | "Nonaktif">("Aktif");
  const [confirmText, setConfirmText] = useState("");
  const deleteItem = useDeleteItem();
  const bulkDelete = useBulkDeleteItems();
  const bulkStatusMutation = useBulkUpdateItemStatus();

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter((it) => {
        const s = stockStatus(it).label;
        return (
          (!debouncedQ ||
            `${it.name} ${it.sku} ${it.barcode ?? ""} ${it.internal_barcode ?? ""}`
              .toLowerCase()
              .includes(debouncedQ.toLowerCase())) &&
          (cat === ALL || it.category === cat) &&
          (subCat === ALL || it.subCategory === subCat) &&
          (brand === ALL || it.brand === brand) &&
          (stockF === ALL || s === stockF) &&
          (status === ALL || it.status === status)
        );
      }),
    [data, debouncedQ, cat, subCat, brand, stockF, status],
  );

  const categoryNames = useMemo(() => cats?.data.map((c) => c.name) ?? [], [cats]);

  const merkNames = useMemo(() => merks?.data.map((m) => m.name) ?? [], [merks]);

  const subCategoryNames = useMemo(() => {
    const all = subs?.data ?? [];
    const list = cat === ALL ? all : all.filter((s) => s.category_name === cat);
    return [...new Set(list.map((s) => s.name))];
  }, [subs, cat]);

  const toggle = (id: number) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteItem.mutateAsync(deleteTarget.id);
      toast.success("Barang dihapus");
      setSelected((p) => p.filter((x) => x !== deleteTarget.id));
      setDeleteTarget(null);
      setConfirmText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const res = await bulkDelete.mutateAsync(selected);
      toast.success(res.message);
      setSelected([]);
      setDeleteDialogOpen(false);
      setConfirmText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkStatus = async () => {
    try {
      const res = await bulkStatusMutation.mutateAsync({ ids: selected, status: statusValue });
      toast.success(res.message);
      setSelected([]);
      setStatusDialogOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openSingleDelete = (r: ItemApi) => {
    setDeleteTarget(r);
    setDeleteDialogOpen(true);
  };

  const columns: Column<ItemApi>[] = [
    ...((canWrite || canDelete
      ? [
          {
            key: "check",
            label: "",
            className: "w-10",
            render: (r: ItemApi) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} />
              </span>
            ),
          },
        ]
      : []) as Column<ItemApi>[]),
    { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    {
      key: "name",
      label: "Nama Barang",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const s = stockStatus(r);
        return (
          <div className="flex flex-col items-start gap-1">
            <Pill tone={r.status === "Aktif" ? "success" : "neutral"}>{r.status}</Pill>
            <Pill tone={s.tone}>{s.label}</Pill>
          </div>
        );
      },
    },
    { key: "cat", label: "Kategori", render: (r) => r.category ?? "—" },
    { key: "brand", label: "Merk", render: (r) => r.brand ?? "—" },
    {
      key: "stock",
      label: "Stock",
      className: "text-right",
      render: (r) => <span className="font-semibold">{formatNumber(r.stock)}</span>,
    },
    {
      key: "cost",
      label: "Harga Pokok",
      className: "whitespace-nowrap tabular-nums text-right",
      render: (r) => formatIDR(r.cost),
    },
    {
      key: "price",
      label: "Harga Jual",
      className: "whitespace-nowrap tabular-nums text-right",
      render: (r) => formatIDR(r.price),
    },
    ...((canWrite || canDelete
      ? [
          {
            key: "actions",
            label: "",
            className: "w-10",
            sticky: "right",
            render: (r: ItemApi) => (
              <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg"
                      aria-label="Aksi barang"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    {canWrite && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(r);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                    )}
                    {(canWrite || canDelete) && <DropdownMenuSeparator />}
                    {canDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => openSingleDelete(r)}
                      >
                        <Trash2 className="h-4 w-4" /> Hapus
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            ),
          },
        ]
      : []) as Column<ItemApi>[]),
  ];

  return (
    <>
      <PageHeader
        title="Master Barang"
        description={`${formatNumber(data?.meta?.total ?? rows.length)} SKU terdaftar`}
        actions={
          <>
            {canWrite && (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => toast.success("Import template diunduh")}
              >
                <Upload className="h-4 w-4" /> Import
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Export Excel diproses")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            {canWrite && (
              <Button
                className="rounded-xl"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Tambah Barang
              </Button>
            )}
          </>
        }
      />

      <Panel
        title="Filter & Pencarian"
        actions={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama, SKU, barcode..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={cat}
            onChange={(v) => {
              setCat(v);
              setSubCat(ALL);
            }}
            placeholder="Semua Kategori"
            options={categoryNames}
          />
          <FilterSelect
            className="w-full"
            value={subCat}
            onChange={setSubCat}
            placeholder="Semua Sub Kategori"
            options={subCategoryNames}
          />
          <FilterSelect
            className="w-full"
            value={brand}
            onChange={setBrand}
            placeholder="Semua Merk"
            options={merkNames}
          />
          <FilterSelect
            className="w-full"
            value={stockF}
            onChange={setStockF}
            placeholder="Semua Stock"
            options={["Normal", "Menipis", "Habis", "Overstock"]}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={["Aktif", "Nonaktif"]}
          />
        </div>
      </Panel>

      {selected.length > 0 && (
        <div className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3">
          <p className="text-sm font-semibold text-primary">{selected.length} barang dipilih</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() => toast.success("Label barcode dicetak")}
            >
              Cetak Barcode
            </Button>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  setStatusValue("Aktif");
                  setStatusDialogOpen(true);
                }}
              >
                Ubah Status
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteTarget(null);
                  setConfirmText("");
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg"
              onClick={() => setSelected([])}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      <Panel title="Daftar Barang" description={`${formatNumber(rows.length)} hasil`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => navigate({ to: "/master/barang/$id", params: { id: String(r.id) } })}
          mobileCard={(r) => {
            const s = stockStatus(r);
            return (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <ItemThumb hue={hueFor(r.id)} label={r.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Pill tone={r.status === "Aktif" ? "success" : "neutral"}>{r.status}</Pill>
                        <Pill tone={s.tone}>{s.label}</Pill>
                      </div>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">{r.sku}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Stock <b className="text-foreground">{formatNumber(r.stock)}</b>
                      </span>
                      <span>{r.category ?? "—"}</span>
                      {r.brand && <span>{r.brand}</span>}
                      <span>{formatIDR(r.price)}</span>
                    </div>
                  </div>
                </div>
                {(canWrite || canDelete) && (
                  <div className="flex items-center gap-2 border-t border-border pt-3">
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(r);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSingleDelete(r);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          }}
        />
      </Panel>

      <ItemFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(o) => {
          if (!o && !deleting) {
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            setConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Barang?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  Barang <b>{deleteTarget.name}</b> ({deleteTarget.sku}) akan dihapus permanen dari
                  master data. Tindakan ini tidak dapat dibatalkan.
                </>
              ) : (
                <>
                  <b>{formatNumber(selected.length)} barang</b> terpilih akan dihapus permanen dari
                  master data. Tindakan ini tidak dapat dibatalkan.
                </>
              )}
              <br />
              Ketik <b className="font-mono">Hapus Barang</b> untuk mengonfirmasi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm" className="text-xs font-medium">
              Konfirmasi
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Hapus Barang"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={deleting}
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTarget(null);
                setConfirmText("");
              }}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleting || confirmText !== "Hapus Barang"}
              onClick={() => (deleteTarget ? confirmDelete() : confirmBulkDelete())}
            >
              {deleting ? "Menghapus…" : "Ya, Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Status Barang</DialogTitle>
            <DialogDescription>
              Ubah status <b>{formatNumber(selected.length)} barang</b> terpilih sekaligus.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={statusValue}
            onValueChange={(v) => setStatusValue(v as "Aktif" | "Nonaktif")}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Aktif" id="status-aktif" />
              <Label htmlFor="status-aktif">Aktif</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Nonaktif" id="status-nonaktif" />
              <Label htmlFor="status-nonaktif">Nonaktif</Label>
            </div>
          </RadioGroup>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setStatusDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="rounded-xl"
              disabled={bulkStatusMutation.isPending}
              onClick={confirmBulkStatus}
            >
              {bulkStatusMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
