import { useState } from "react";
import { toast } from "sonner";
import { MasterCrudPage } from "./master-crud";
import { CategoryFormDialog, MerkFormDialog, SubCategoryFormDialog } from "./master-forms";
import { EmptyState, Pill, TableSkeleton } from "./kit";
import { type Column } from "./data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCategories,
  useDeleteCategory,
  useDeleteMerk,
  useDeleteSubCategory,
  useMerks,
  useSubCategories,
} from "@/hooks/use-master";
import type { Category, Merk, SubCategory } from "@/lib/master-types";

function ActivePill({ active }: { active: boolean }) {
  return active ? <Pill tone="success">Aktif</Pill> : <Pill tone="neutral">Nonaktif</Pill>;
}

export function KategoriPage() {
  const { data, isLoading } = useCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [viewing, setViewing] = useState<Category | null>(null);
  const del = useDeleteCategory();

  const columns: Column<Category>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Kategori",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "sub_count",
      label: "Sub Kategori",
      render: (r) => (r.sub_category_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Category>
        title="Kategori"
        description="Pengelompokan utama barang"
        searchPlaceholder="Cari kategori..."
        searchText={(r) => `${r.code} ${r.name}`}
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        onAdd={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onEdit={(r) => {
          setEditing(r);
          setDialogOpen(true);
        }}
        onDelete={async (r) => {
          try {
            await del.mutateAsync(r.id);
            toast.success("Kategori dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        onRowClick={(r) => setViewing(r)}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.sub_category_count ?? 0} sub kategori
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <CategoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
      <CategorySubCategoriesDialog
        category={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </>
  );
}

export function SubKategoriPage() {
  const { data, isLoading } = useSubCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | null>(null);
  const del = useDeleteSubCategory();

  const columns: Column<SubCategory>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Sub Kategori",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "parent", label: "Induk Kategori", render: (r) => r.category_name ?? "—" },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<SubCategory>
        title="Sub Kategori"
        description="Turunan dari kategori barang"
        searchPlaceholder="Cari sub kategori..."
        searchText={(r) => `${r.code} ${r.name} ${r.category_name ?? ""}`}
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        onAdd={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onEdit={(r) => {
          setEditing(r);
          setDialogOpen(true);
        }}
        onDelete={async (r) => {
          try {
            await del.mutateAsync(r.id);
            toast.success("Sub kategori dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.category_name ?? "—"}
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <SubCategoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function MerkPage() {
  const { data, isLoading } = useMerks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Merk | null>(null);
  const del = useDeleteMerk();

  const columns: Column<Merk>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Merk",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "country", label: "Negara", render: (r) => r.country ?? "—" },
    {
      key: "item_count",
      label: "Jumlah SKU",
      render: (r) => (r.item_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Merk>
        title="Merk"
        description="Daftar merk / brand barang"
        searchPlaceholder="Cari merk..."
        searchText={(r) => `${r.code} ${r.name}`}
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        onAdd={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onEdit={(r) => {
          setEditing(r);
          setDialogOpen(true);
        }}
        onDelete={async (r) => {
          try {
            await del.mutateAsync(r.id);
            toast.success("Merk dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.country ?? "—"} • {r.item_count ?? 0} SKU
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <MerkFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

function CategorySubCategoriesDialog({
  category,
  onOpenChange,
}: {
  category: Category | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useSubCategories();

  const list = category ? (data?.data ?? []).filter((sc) => sc.category_id === category.id) : [];

  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>Sub Kategori — {category?.name}</DialogTitle>
          <DialogDescription>
            {category?.code} • {category?.sub_category_count ?? 0} sub kategori
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : list.length === 0 ? (
          <EmptyState
            title="Belum ada sub kategori"
            description="Kategori ini belum memiliki sub kategori. Tambahkan lewat halaman Sub Kategori."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {list.map((sc) => (
              <li
                key={sc.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sc.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{sc.code}</p>
                </div>
                <ActivePill active={sc.is_active} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
