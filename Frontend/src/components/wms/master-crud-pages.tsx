import { useState } from "react";
import { toast } from "sonner";
import { MasterCrudPage } from "./master-crud";
import {
  BinFormDialog,
  CategoryFormDialog,
  CustomerFormDialog,
  DepartmentFormDialog,
  MerkFormDialog,
  ProjectFormDialog,
  RackFormDialog,
  SubCategoryFormDialog,
  SupplierFormDialog,
  UnitFormDialog,
  VendorFormDialog,
  WarehouseFormDialog,
  WorkOrderFormDialog,
} from "./master-forms";
import { ALL, EmptyState, FilterSelect, Pill, TableSkeleton, type Tone } from "./kit";
import { CustomerDetailSheet, SupplierDetailSheet, VendorDetailSheet } from "./party-detail";
import { type Column } from "./data-table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useBins,
  useCategories,
  useCustomers,
  useDeleteBin,
  useDeleteCategory,
  useDeleteCustomer,
  useDeleteDepartment,
  useDeleteMerk,
  useDeleteProject,
  useDeleteRack,
  useDeleteSubCategory,
  useDeleteSupplier,
  useDeleteUnit,
  useDeleteVendor,
  useDeleteWarehouse,
  useDeleteWorkOrder,
  useDepartments,
  useMerks,
  useProjects,
  useRacks,
  useSubCategories,
  useSuppliers,
  useUnits,
  useVendors,
  useWarehouses,
  useWorkOrders,
} from "@/hooks/use-master";
import type {
  Bin,
  Category,
  Customer,
  Department,
  Merk,
  Project,
  Rack,
  SubCategory,
  Supplier,
  Unit,
  Vendor,
  Warehouse,
  WorkOrder,
} from "@/lib/master-types";

function statusTone(status: string): Tone {
  if (status === "Selesai") return "success";
  if (status === "Berjalan") return "info";
  if (status === "Ditunda") return "warning";
  return "neutral";
}

function ActivePill({ active }: { active: boolean }) {
  return active ? <Pill tone="success">Aktif</Pill> : <Pill tone="neutral">Nonaktif</Pill>;
}

function uniqueOptions<T>(rows: T[], pick: (r: T) => string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
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

export function SatuanPage() {
  const { data, isLoading } = useUnits();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const del = useDeleteUnit();

  const columns: Column<Unit>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Satuan",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "item_count",
      label: "Jumlah SKU",
      render: (r) => (r.item_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Unit>
        title="Satuan"
        description="Daftar satuan (unit of measure) barang"
        searchPlaceholder="Cari satuan..."
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
            toast.success("Satuan dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.item_count ?? 0} SKU</p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <UnitFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function GudangPage() {
  const { data, isLoading } = useWarehouses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const del = useDeleteWarehouse();

  const columns: Column<Warehouse>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Gudang",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "city", label: "Kota", render: (r) => r.city ?? "—" },
    { key: "address", label: "Alamat", render: (r) => r.address ?? "—" },
    {
      key: "item_count",
      label: "Jumlah SKU",
      render: (r) => (r.item_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Warehouse>
        title="Gudang"
        description="Daftar lokasi penyimpanan barang"
        searchPlaceholder="Cari gudang..."
        searchText={(r) => `${r.code} ${r.name} ${r.city ?? ""}`}
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
            toast.success("Gudang dihapus");
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
                {r.city ?? "—"} • {r.item_count ?? 0} SKU
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <WarehouseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function RakPage() {
  const { data, isLoading } = useRacks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const del = useDeleteRack();

  const columns: Column<Rack>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Rak",
      render: (r) => <span className="font-medium">{r.name ?? r.code}</span>,
    },
    { key: "warehouse", label: "Gudang", render: (r) => r.warehouse_name ?? "—" },
    {
      key: "bin_count",
      label: "Jumlah Bin",
      render: (r) => (r.bin_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Rack>
        title="Rak"
        description="Rak penyimpanan per gudang"
        searchPlaceholder="Cari rak..."
        searchText={(r) => `${r.code} ${r.name ?? ""} ${r.warehouse_name ?? ""}`}
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
            toast.success("Rak dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name ?? r.code}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.warehouse_name ?? "—"} • {r.bin_count ?? 0} bin
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <RackFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function BinPage() {
  const { data, isLoading } = useBins();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bin | null>(null);
  const del = useDeleteBin();

  const columns: Column<Bin>[] = [
    {
      key: "code",
      label: "Alamat Lengkap",
      render: (r) => <span className="font-mono text-xs">{r.full_address ?? r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Bin",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "rack", label: "Rak", render: (r) => r.rack_name ?? "—" },
    { key: "warehouse", label: "Gudang", render: (r) => r.warehouse_name ?? "—" },
    {
      key: "item_count",
      label: "Jumlah SKU",
      render: (r) => (r.item_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  return (
    <>
      <MasterCrudPage<Bin>
        title="Bin Location"
        description="Titik penyimpanan terkecil di dalam rak"
        searchPlaceholder="Cari bin..."
        searchText={(r) =>
          `${r.full_address ?? ""} ${r.code} ${r.name} ${r.rack_name ?? ""} ${r.warehouse_name ?? ""}`
        }
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
            toast.success("Bin dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {r.full_address ?? r.code}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.warehouse_name ?? "—"} • {r.rack_name ?? "—"} • {r.item_count ?? 0} SKU
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <BinFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function SupplierPage() {
  const { data, isLoading } = useSuppliers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [termsFilter, setTermsFilter] = useState(ALL);
  const del = useDeleteSupplier();

  const rows = data?.data ?? [];
  const filtered = rows.filter(
    (r) =>
      (cityFilter === ALL || r.city === cityFilter) &&
      (termsFilter === ALL || r.payment_terms === termsFilter),
  );

  const columns: Column<Supplier>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Supplier",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "city", label: "Kota", render: (r) => r.city ?? "—" },
    { key: "payment_terms", label: "Termin", render: (r) => r.payment_terms ?? "—" },
    {
      key: "items_count",
      label: "Jumlah Barang",
      render: (r) => (r.items_count ?? 0).toLocaleString("id-ID"),
    },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `suppliers-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "code", label: "Kode" },
        { key: "name", label: "Nama Supplier" },
        { key: "legal_name", label: "Nama Legal" },
        { key: "nib", label: "NIB" },
        { key: "npwp", label: "NPWP" },
        { key: "phone", label: "Telepon" },
        { key: "email", label: "Email" },
        { key: "pic_name", label: "PIC" },
        { key: "website", label: "Website" },
        { key: "address", label: "Alamat" },
        { key: "city", label: "Kota" },
        { key: "bank_name", label: "Bank" },
        { key: "bank_account_no", label: "No. Rekening" },
        { key: "bank_account_name", label: "Atas Nama" },
        { key: "payment_terms", label: "Termin Pembayaran" },
        { key: "is_active", label: "Status" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<Supplier>
        title="Supplier"
        description="Daftar pemasok barang"
        searchPlaceholder="Cari supplier..."
        searchText={(r) => `${r.code} ${r.name} ${r.city ?? ""} ${r.payment_terms ?? ""}`}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        onView={setViewing}
        onRowClick={setViewing}
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
            toast.success("Supplier dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <>
            <FilterSelect
              value={cityFilter}
              onChange={setCityFilter}
              placeholder="Semua Kota"
              options={uniqueOptions(rows, (r) => r.city)}
            />
            <FilterSelect
              value={termsFilter}
              onChange={setTermsFilter}
              placeholder="Semua Termin"
              options={["NET 30", "NET 14", "COD", "NET 45"]}
            />
          </>
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.city ?? "—"} • {r.payment_terms ?? "—"} • {r.items_count ?? 0} barang
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <SupplierDetailSheet
        entity={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={() => {
          setViewing(null);
          setEditing(viewing);
          setDialogOpen(true);
        }}
      />
      <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function CustomerPage() {
  const { data, isLoading } = useCustomers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [segmentFilter, setSegmentFilter] = useState(ALL);
  const del = useDeleteCustomer();

  const rows = data?.data ?? [];
  const filtered = rows.filter(
    (r) =>
      (cityFilter === ALL || r.city === cityFilter) &&
      (segmentFilter === ALL || r.segment === segmentFilter),
  );

  const columns: Column<Customer>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Customer",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "city", label: "Kota", render: (r) => r.city ?? "—" },
    { key: "segment", label: "Segmen", render: (r) => r.segment ?? "—" },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `customers-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "code", label: "Kode" },
        { key: "name", label: "Nama Customer" },
        { key: "legal_name", label: "Nama Legal" },
        { key: "nib", label: "NIB" },
        { key: "npwp", label: "NPWP" },
        { key: "phone", label: "Telepon" },
        { key: "email", label: "Email" },
        { key: "pic_name", label: "PIC" },
        { key: "website", label: "Website" },
        { key: "address", label: "Alamat" },
        { key: "city", label: "Kota" },
        { key: "segment", label: "Segmen" },
        { key: "bank_name", label: "Bank" },
        { key: "bank_account_no", label: "No. Rekening" },
        { key: "bank_account_name", label: "Atas Nama" },
        { key: "is_active", label: "Status" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<Customer>
        title="Customer"
        description="Daftar pembeli / pelanggan"
        searchPlaceholder="Cari customer..."
        searchText={(r) => `${r.code} ${r.name} ${r.city ?? ""} ${r.segment ?? ""}`}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        onView={setViewing}
        onRowClick={setViewing}
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
            toast.success("Customer dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <>
            <FilterSelect
              value={cityFilter}
              onChange={setCityFilter}
              placeholder="Semua Kota"
              options={uniqueOptions(rows, (r) => r.city)}
            />
            <FilterSelect
              value={segmentFilter}
              onChange={setSegmentFilter}
              placeholder="Semua Segmen"
              options={["Retail", "Distributor", "Proyek", "Korporat"]}
            />
          </>
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.city ?? "—"} • {r.segment ?? "—"}
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <CustomerDetailSheet
        entity={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={() => {
          setViewing(null);
          setEditing(viewing);
          setDialogOpen(true);
        }}
      />
      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function VendorPage() {
  const { data, isLoading } = useVendors();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [viewing, setViewing] = useState<Vendor | null>(null);
  const [serviceFilter, setServiceFilter] = useState(ALL);
  const del = useDeleteVendor();

  const rows = data?.data ?? [];
  const filtered = rows.filter((r) => serviceFilter === ALL || r.service_type === serviceFilter);

  const columns: Column<Vendor>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Vendor",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "service_type", label: "Jenis Layanan", render: (r) => r.service_type ?? "—" },
    { key: "contact_phone", label: "Kontak", render: (r) => r.contact_phone ?? "—" },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `vendors-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "code", label: "Kode" },
        { key: "name", label: "Nama Vendor" },
        { key: "legal_name", label: "Nama Legal" },
        { key: "nib", label: "NIB" },
        { key: "npwp", label: "NPWP" },
        { key: "service_type", label: "Jenis Layanan" },
        { key: "contact_phone", label: "Kontak" },
        { key: "email", label: "Email" },
        { key: "pic_name", label: "PIC" },
        { key: "website", label: "Website" },
        { key: "bank_name", label: "Bank" },
        { key: "bank_account_no", label: "No. Rekening" },
        { key: "bank_account_name", label: "Atas Nama" },
        { key: "is_active", label: "Status" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<Vendor>
        title="Vendor"
        description="Daftar penyedia jasa pendukung"
        searchPlaceholder="Cari vendor..."
        searchText={(r) => `${r.code} ${r.name} ${r.service_type ?? ""}`}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        onView={setViewing}
        onRowClick={setViewing}
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
            toast.success("Vendor dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <>
            <FilterSelect
              value={serviceFilter}
              onChange={setServiceFilter}
              placeholder="Semua Layanan"
              options={["Ekspedisi", "Maintenance", "Kalibrasi", "Cleaning"]}
            />
          </>
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.service_type ?? "—"} • {r.contact_phone ?? "—"}
              </p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <VendorDetailSheet
        entity={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={() => {
          setViewing(null);
          setEditing(viewing);
          setDialogOpen(true);
        }}
      />
      <VendorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
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

export function DepartemenPage() {
  const { data, isLoading } = useDepartments();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const del = useDeleteDepartment();

  const rows = data?.data ?? [];
  const filtered = rows.filter(
    (r) => statusFilter === ALL || r.is_active === (statusFilter === "Aktif"),
  );

  const columns: Column<Department>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Departemen",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "head", label: "Kepala Departemen", render: (r) => r.head ?? "—" },
    { key: "status", label: "Status", render: (r) => <ActivePill active={r.is_active} /> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `departments-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "code", label: "Kode" },
        { key: "name", label: "Nama Departemen" },
        { key: "head", label: "Kepala Departemen" },
        { key: "is_active", label: "Status" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<Department>
        title="Departemen"
        description="Daftar departemen / divisi"
        searchPlaceholder="Cari departemen..."
        searchText={(r) => `${r.code} ${r.name} ${r.head ?? ""}`}
        columns={columns}
        rows={filtered}
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
            toast.success("Departemen dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Semua Status"
            options={["Aktif", "Nonaktif"]}
          />
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">Kepala: {r.head ?? "—"}</p>
            </div>
            <ActivePill active={r.is_active} />
          </div>
        )}
      />
      <DepartmentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function ProyekPage() {
  const { data, isLoading } = useProjects();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const del = useDeleteProject();

  const rows = data?.data ?? [];
  const filtered = rows.filter((r) => statusFilter === ALL || r.status === statusFilter);

  const range = (start?: string | null, end?: string | null) =>
    start ? `${formatDate(start)}${end ? ` → ${formatDate(end)}` : ""}` : "—";

  const columns: Column<Project>[] = [
    {
      key: "code",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      label: "Nama Proyek",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "pic", label: "PIC", render: (r) => r.pic ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
    {
      key: "budget",
      label: "Anggaran",
      render: (r) => (r.budget != null ? formatIDR(Number(r.budget)) : "—"),
    },
    { key: "period", label: "Periode", render: (r) => range(r.start_date, r.end_date) },
    { key: "wo_count", label: "WO", render: (r) => r.work_orders_count ?? 0 },
  ];

  const exportCsv = () => {
    downloadCsv(
      `projects-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "code", label: "Kode" },
        { key: "name", label: "Nama Proyek" },
        { key: "pic", label: "PIC" },
        { key: "status", label: "Status" },
        { key: "budget", label: "Anggaran" },
        { key: "start_date", label: "Tanggal Mulai" },
        { key: "end_date", label: "Tanggal Selesai" },
        { key: "work_orders_count", label: "Jumlah WO" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<Project>
        title="Proyek"
        description="Daftar proyek pekerjaan"
        searchPlaceholder="Cari proyek..."
        searchText={(r) => `${r.code} ${r.name} ${r.pic ?? ""} ${r.status}`}
        columns={columns}
        rows={filtered}
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
            toast.success("Proyek dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Semua Status"
            options={["Perencanaan", "Berjalan", "Selesai"]}
          />
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.code}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                PIC: {r.pic ?? "—"} • {r.work_orders_count ?? 0} WO
              </p>
            </div>
            <Pill tone={statusTone(r.status)}>{r.status}</Pill>
          </div>
        )}
      />
      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}

export function WorkOrderPage() {
  const { data, isLoading } = useWorkOrders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [projectFilter, setProjectFilter] = useState(ALL);
  const del = useDeleteWorkOrder();

  const rows = data?.data ?? [];
  const filtered = rows.filter(
    (r) =>
      (statusFilter === ALL || r.status === statusFilter) &&
      (projectFilter === ALL || r.project === projectFilter),
  );

  const range = (start?: string | null, end?: string | null) =>
    start ? `${formatDate(start)}${end ? ` → ${formatDate(end)}` : ""}` : "—";

  const columns: Column<WorkOrder>[] = [
    {
      key: "no",
      label: "Nomor",
      render: (r) => <span className="font-mono text-xs">{r.no}</span>,
    },
    { key: "project", label: "Proyek", render: (r) => r.project ?? "—" },
    { key: "item", label: "Produk", render: (r) => r.item ?? "—" },
    {
      key: "target",
      label: "Target",
      render: (r) => (
        <span className="font-medium">
          {formatNumber(r.target_qty)} {r.unit ?? ""}
        </span>
      ),
    },
    { key: "schedule", label: "Jadwal", render: (r) => range(r.start_date, r.finish_date) },
    { key: "pic", label: "PIC", render: (r) => r.pic ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  const exportCsv = () => {
    downloadCsv(
      `work-orders-${dateStamp()}.csv`,
      toCsv(filtered, [
        { key: "no", label: "Nomor" },
        { key: "project", label: "Proyek" },
        { key: "item", label: "Produk" },
        { key: "target_qty", label: "Target" },
        { key: "unit", label: "Satuan" },
        { key: "start_date", label: "Tanggal Mulai" },
        { key: "finish_date", label: "Tanggal Selesai" },
        { key: "pic", label: "PIC" },
        { key: "status", label: "Status" },
      ]),
    );
  };

  return (
    <>
      <MasterCrudPage<WorkOrder>
        title="Work Order"
        description="Daftar instruksi kerja produksi"
        searchPlaceholder="Cari work order..."
        searchText={(r) => `${r.no} ${r.project ?? ""} ${r.item ?? ""} ${r.pic ?? ""} ${r.status}`}
        columns={columns}
        rows={filtered}
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
            toast.success("Work order dihapus");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        filters={
          <>
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Semua Status"
              options={["Perencanaan", "Berjalan", "Selesai", "Ditunda"]}
            />
            <FilterSelect
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="Semua Proyek"
              options={uniqueOptions(rows, (r) => r.project)}
            />
          </>
        }
        onExport={exportCsv}
        mobileCard={(r) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.no}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.project ?? "—"} • {r.item ?? "—"}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {formatNumber(r.target_qty)} {r.unit ?? ""} • PIC: {r.pic ?? "—"}
              </p>
            </div>
            <Pill tone={statusTone(r.status)}>{r.status}</Pill>
          </div>
        )}
      />
      <WorkOrderFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </>
  );
}
