import { toast } from "sonner";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CrudFormDialog } from "./master-crud";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormCombobox, type ComboboxOption } from "./form-combobox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ACCESS_LEVELS,
  ACCESS_MODULES,
  binSchema,
  categorySchema,
  createUserSchema,
  customerSchema,
  departmentSchema,
  itemSchema,
  merkSchema,
  projectSchema,
  rackSchema,
  subCategorySchema,
  supplierSchema,
  unitSchema,
  updateUserSchema,
  vendorSchema,
  warehouseSchema,
  workOrderSchema,
  USER_ROLES,
  type AccessLevel,
  type BinInput,
  type CategoryInput,
  type CustomerInput,
  type DepartmentInput,
  type ItemInput,
  type MerkInput,
  type ProjectInput,
  type RackInput,
  type RoleAccessEntry,
  type SubCategoryInput,
  type SupplierInput,
  type UnitInput,
  type UserInput,
  type VendorInput,
  type WarehouseInput,
  type WorkOrderInput,
} from "@/lib/schemas";
import { fieldError } from "@/lib/api";
import {
  useBins,
  useCategories,
  useCreateBin,
  useCreateCategory,
  useCreateCustomer,
  useCreateDepartment,
  useCreateItem,
  useCreateMerk,
  useCreateProject,
  useCreateRack,
  useCreateSubCategory,
  useCreateSupplier,
  useCreateUnit,
  useCreateUser,
  useCreateVendor,
  useCreateWarehouse,
  useCreateWorkOrder,
  useCustomers,
  useDepartments,
  useItems,
  useMerks,
  useProjects,
  useRacks,
  useSubCategories,
  useSuppliers,
  useUnits,
  useUpdateBin,
  useUpdateCategory,
  useUpdateCustomer,
  useUpdateDepartment,
  useUpdateItem,
  useUpdateMerk,
  useUpdateProject,
  useUpdateRack,
  useUpdateSubCategory,
  useUpdateSupplier,
  useUpdateUnit,
  useUpdateUser,
  useUpdateVendor,
  useUpdateWarehouse,
  useUpdateWorkOrder,
  useUpdateRole,
  useUsers,
  useVendors,
  useWarehouses,
  useWorkOrders,
  type BinPayload,
  type CategoryPayload,
  type CustomerPayload,
  type DepartmentPayload,
  type ItemPayload,
  type MerkPayload,
  type ProjectPayload,
  type RackPayload,
  type SubCategoryPayload,
  type SupplierPayload,
  type UnitPayload,
  type UserPayload,
  type VendorPayload,
  type WarehousePayload,
  type WorkOrderPayload,
} from "@/hooks/use-master";
import type {
  Bin,
  Category,
  Customer,
  Department,
  ItemApi,
  MasterUser,
  Merk,
  Project,
  Rack,
  RoleCatalog,
  SubCategory,
  Supplier,
  Unit,
  Vendor,
  Warehouse,
  WorkOrder,
} from "@/lib/master-types";

function rowField(
  form: { setError: (n: string, o: { message: string }) => void },
  err: unknown,
  field: string,
) {
  const msg = fieldError(err, field);
  if (msg) form.setError(field, { message: msg });
}

function nextCode(codes: string[], prefix: string): string {
  let max = 0;
  for (const c of codes) {
    const suffix = c.slice(prefix.length + 1);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function nextSku(codes: string[]): string {
  let bestSeries = 10000;
  let bestSeq = 0;
  for (const c of codes) {
    const m = /^SKU-(\d+)-(\d{3})$/.exec(c);
    if (!m) continue;
    const series = Number(m[1]);
    const seq = Number(m[2]);
    if (series > bestSeries || (series === bestSeries && seq > bestSeq)) {
      bestSeries = series;
      bestSeq = seq;
    }
  }
  if (bestSeries === 10000 && bestSeq === 0) return "SKU-10001-001";
  if (bestSeq >= 999) return `SKU-${bestSeries + 1}-001`;
  return `SKU-${bestSeries}-${String(bestSeq + 1).padStart(3, "0")}`;
}

function nextYearlyCode(codes: string[], prefix: string, year = new Date().getFullYear()): string {
  const head = `${prefix}/${year}/`;
  let max = 0;
  for (const c of codes) {
    if (!c.startsWith(head)) continue;
    const suffix = c.slice(head.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${head}${String(max + 1).padStart(4, "0")}`;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Category | null;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const { data: cats } = useCategories();
  const previewCode = nextCode(
    (cats?.data ?? []).map((c) => c.code),
    "KAT",
  );

  return (
    <CrudFormDialog<CategoryInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Kategori" : "Tambah Kategori"}
      description="Kategori mengelompokkan barang dalam satu klasifikasi utama."
      schema={categorySchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              description: initial.description ?? "",
              is_active: initial.is_active,
            }
          : { code: "", name: "", description: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: CategoryPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const desc = values.description.trim();
        if (desc) payload.description = desc;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Kategori diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Kategori ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          if (!fieldError(err, "code") && !fieldError(err, "name"))
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Kategori</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Kategori</FormLabel>
                  <FormControl>
                    <Input placeholder="Komponen Elektronik" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Deskripsi <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Kategori untuk alat kesehatan"
                      className="rounded-xl"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="cat-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="cat-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function SubCategoryFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SubCategory | null;
}) {
  const create = useCreateSubCategory();
  const update = useUpdateSubCategory();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: subCats } = useSubCategories();
  const previewCode = nextCode(
    (subCats?.data ?? []).map((s) => s.code),
    "SUB",
  );

  return (
    <CrudFormDialog<SubCategoryInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Sub Kategori" : "Tambah Sub Kategori"}
      description="Sub kategori berada di bawah induk kategori."
      schema={subCategorySchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              category_id: initial.category_id,
              code: initial.code,
              name: initial.name,
              is_active: initial.is_active,
            }
          : { category_id: 0, code: "", name: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: SubCategoryPayload = {
          category_id: values.category_id,
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Sub kategori diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Sub kategori ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "category_id");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "category_id")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => {
                const catOptions: ComboboxOption[] = (cats?.data ?? []).map((c) => ({
                  value: String(c.id),
                  label: c.name,
                  keywords: c.code,
                }));
                return (
                  <FormItem>
                    <FormLabel>Induk Kategori</FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                        options={catOptions}
                        placeholder="Pilih kategori"
                        loading={catsLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Sub Kategori</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Sub Kategori</FormLabel>
                  <FormControl>
                    <Input placeholder="Sirkuit" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="subcat-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="subcat-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function MerkFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Merk | null;
}) {
  const create = useCreateMerk();
  const update = useUpdateMerk();
  const { data: merks } = useMerks();
  const previewCode = nextCode(
    (merks?.data ?? []).map((m) => m.code),
    "MRK",
  );

  return (
    <CrudFormDialog<MerkInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Merk" : "Tambah Merk"}
      description="Merk / brand barang yang terdaftar di master data."
      schema={merkSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              country: initial.country ?? "",
              is_active: initial.is_active,
            }
          : { code: "", name: "", country: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: MerkPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const country = values.country.trim();
        if (country) payload.country = country;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Merk diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Merk ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          if (!fieldError(err, "code") && !fieldError(err, "name"))
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Merk</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Merk</FormLabel>
                  <FormControl>
                    <Input placeholder="Bosch" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Negara <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Indonesia" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="merk-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="merk-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function UnitFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Unit | null;
}) {
  const create = useCreateUnit();
  const update = useUpdateUnit();
  const { data: unitRows } = useUnits();
  const previewCode = nextCode(
    (unitRows?.data ?? []).map((u) => u.code),
    "UNT",
  );

  return (
    <CrudFormDialog<UnitInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Satuan" : "Tambah Satuan"}
      description="Satuan (unit of measure) untuk barang."
      schema={unitSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              is_active: initial.is_active,
            }
          : { code: "", name: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: UnitPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Satuan diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Satuan ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          if (!fieldError(err, "code") && !fieldError(err, "name"))
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Satuan</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Satuan</FormLabel>
                  <FormControl>
                    <Input placeholder="PCS" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="unit-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="unit-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function WarehouseFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Warehouse | null;
}) {
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const { data: whRows } = useWarehouses();
  const previewCode = nextCode(
    (whRows?.data ?? []).map((w) => w.code),
    "GDG",
  );

  return (
    <CrudFormDialog<WarehouseInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Gudang" : "Tambah Gudang"}
      description="Lokasi penyimpanan barang."
      schema={warehouseSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              city: initial.city ?? "",
              address: initial.address ?? "",
              is_active: initial.is_active,
            }
          : { code: "", name: "", city: "", address: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: WarehousePayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const city = values.city.trim();
        if (city) payload.city = city;
        const address = values.address.trim();
        if (address) payload.address = address;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Gudang diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Gudang ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          if (!fieldError(err, "code") && !fieldError(err, "name"))
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Gudang</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Gudang</FormLabel>
                  <FormControl>
                    <Input placeholder="Gudang Pusat Jakarta" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Kota <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Jakarta" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Alamat <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Jl. Merdeka No. 1"
                      className="rounded-xl"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="warehouse-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="warehouse-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function RackFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Rack | null;
}) {
  const create = useCreateRack();
  const update = useUpdateRack();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();

  return (
    <CrudFormDialog<RackInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Rak" : "Tambah Rak"}
      description="Rak penyimpanan barang di dalam gudang."
      schema={rackSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              warehouse_id: initial.warehouse_id,
              aisle: initial.aisle,
              bay: initial.bay,
              name: initial.name,
              is_active: initial.is_active,
            }
          : { warehouse_id: 0, aisle: "", bay: "", name: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: RackPayload = {
          warehouse_id: values.warehouse_id,
          aisle: values.aisle.trim().toUpperCase(),
          bay: values.bay.trim(),
          name:
            (values.name ?? "").trim() ||
            `Rak ${values.aisle.trim().toUpperCase()}-${values.bay.trim()}`,
          is_active: values.is_active,
        };
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Rak diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Rak ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "aisle");
          rowField(form as never, err, "bay");
          rowField(form as never, err, "name");
          rowField(form as never, err, "warehouse_id");
          if (
            !fieldError(err, "aisle") &&
            !fieldError(err, "bay") &&
            !fieldError(err, "name") &&
            !fieldError(err, "warehouse_id")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => {
        const aisle = form.watch("aisle");
        const bay = form.watch("bay");
        const preview = `${aisle.trim().toUpperCase() || "A"}-${bay.trim() || "01"}`;
        return (
          <Form {...form}>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="warehouse_id"
                render={({ field }) => {
                  const warehouseOptions: ComboboxOption[] = (warehouses?.data ?? []).map((w) => ({
                    value: String(w.id),
                    label: w.name,
                    keywords: w.code,
                  }));
                  return (
                    <FormItem>
                      <FormLabel>Gudang</FormLabel>
                      <FormControl>
                        <FormCombobox
                          value={String(field.value)}
                          onValueChange={(v) => field.onChange(Number(v))}
                          options={warehouseOptions}
                          placeholder="Pilih gudang"
                          loading={warehousesLoading}
                          side="bottom"
                          avoidCollisions={false}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="aisle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aisle</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          maxLength={1}
                          placeholder="A"
                          className="rounded-xl uppercase"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bay</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={2} placeholder="03" className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Kode Rak otomatis: <span className="font-mono">{preview}</span> • Nama otomatis{" "}
                <span className="font-mono">Rak {preview}</span> bila dikosongkan
              </p>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Nama Rak <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Rak Sparepart Elektronik"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                    <Label htmlFor="rack-active">Aktif</Label>
                    <FormControl>
                      <Switch
                        id="rack-active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Form>
        );
      }}
    />
  );
}

export function BinFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Bin | null;
}) {
  const create = useCreateBin();
  const update = useUpdateBin();
  const { data: racks, isLoading: racksLoading } = useRacks();

  return (
    <CrudFormDialog<BinInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Bin" : "Tambah Bin"}
      description="Titik penyimpanan terkecil di dalam rak."
      schema={binSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              rack_id: initial.rack_id,
              level: initial.level,
              position: initial.position,
              name: initial.name,
              is_active: initial.is_active,
            }
          : { rack_id: 0, level: "", position: "", name: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: BinPayload = {
          rack_id: values.rack_id,
          level: values.level.trim(),
          position: values.position.trim(),
          name: values.name.trim(),
          is_active: values.is_active,
        };
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Bin diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Bin ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "level");
          rowField(form as never, err, "position");
          rowField(form as never, err, "name");
          rowField(form as never, err, "rack_id");
          if (
            !fieldError(err, "level") &&
            !fieldError(err, "position") &&
            !fieldError(err, "name") &&
            !fieldError(err, "rack_id")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => {
        const level = form.watch("level");
        const position = form.watch("position");
        const preview = `${level.trim() || "01"}-${position.trim() || "02"}`;
        return (
          <Form {...form}>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="rack_id"
                render={({ field }) => {
                  const rackOptions: ComboboxOption[] = (racks?.data ?? []).map((r) => ({
                    value: String(r.id),
                    label: `${r.code} — ${r.name} (${r.warehouse_name ?? "—"})`,
                    keywords: r.name,
                  }));
                  return (
                    <FormItem>
                      <FormLabel>Rak</FormLabel>
                      <FormControl>
                        <FormCombobox
                          value={String(field.value)}
                          onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                          options={rackOptions}
                          placeholder="Pilih rak"
                          loading={racksLoading}
                          side="bottom"
                          avoidCollisions={false}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Level</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={2} placeholder="01" className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Posisi</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={2} placeholder="02" className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Kode Bin otomatis: <span className="font-mono">{preview}</span>
              </p>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Bin</FormLabel>
                    <FormControl>
                      <Input placeholder="Bin 1" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                    <Label htmlFor="bin-active">Aktif</Label>
                    <FormControl>
                      <Switch
                        id="bin-active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Form>
        );
      }}
    />
  );
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Supplier | null;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const { data: suppliers } = useSuppliers();
  const previewCode = nextCode(
    (suppliers?.data ?? []).map((s) => s.code),
    "SUP",
  );

  return (
    <CrudFormDialog<SupplierInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Supplier" : "Tambah Supplier"}
      description="Pemasok barang yang dijadikan referensi di master Barang."
      schema={supplierSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              legal_name: initial.legal_name ?? "",
              nib: initial.nib ?? "",
              phone: initial.phone ?? "",
              email: initial.email ?? "",
              pic_name: initial.pic_name ?? "",
              website: initial.website ?? "",
              address: initial.address ?? "",
              city: initial.city ?? "",
              npwp: initial.npwp ?? "",
              payment_terms: (initial.payment_terms ?? "") as SupplierInput["payment_terms"],
              bank_name: initial.bank_name ?? "",
              bank_account_no: initial.bank_account_no ?? "",
              bank_account_name: initial.bank_account_name ?? "",
              is_active: initial.is_active,
            }
          : {
              code: "",
              name: "",
              legal_name: "",
              nib: "",
              phone: "",
              email: "",
              pic_name: "",
              website: "",
              address: "",
              city: "",
              npwp: "",
              payment_terms: "",
              bank_name: "",
              bank_account_no: "",
              bank_account_name: "",
              is_active: true,
            }
      }
      onSubmit={async (values, form) => {
        const payload: SupplierPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const legalName = values.legal_name?.trim();
        if (legalName) payload.legal_name = legalName;
        const nib = values.nib?.trim();
        if (nib) payload.nib = nib;
        const phone = values.phone?.trim();
        if (phone) payload.phone = phone;
        const email = values.email?.trim();
        if (email) payload.email = email;
        const picName = values.pic_name?.trim();
        if (picName) payload.pic_name = picName;
        const website = values.website?.trim();
        if (website) payload.website = website;
        const address = values.address?.trim();
        if (address) payload.address = address;
        const city = values.city?.trim();
        if (city) payload.city = city;
        const npwp = values.npwp?.trim();
        if (npwp) payload.npwp = npwp;
        if (values.payment_terms) payload.payment_terms = values.payment_terms;
        const bankName = values.bank_name?.trim();
        if (bankName) payload.bank_name = bankName;
        const bankAccountNo = values.bank_account_no?.trim();
        if (bankAccountNo) payload.bank_account_no = bankAccountNo;
        const bankAccountName = values.bank_account_name?.trim();
        if (bankAccountName) payload.bank_account_name = bankAccountName;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Supplier diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Supplier ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "email");
          rowField(form as never, err, "npwp");
          rowField(form as never, err, "nib");
          rowField(form as never, err, "website");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "email") &&
            !fieldError(err, "npwp") &&
            !fieldError(err, "nib") &&
            !fieldError(err, "website")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Supplier</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Supplier</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="PT Sumber Makmur Sentosa"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nama Legal <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nama sesuai akta / dokumen resmi"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nib"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NIB <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="13 digit NIB" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="npwp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NPWP <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="NPWP perusahaan" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Telepon <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="021-555..." className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="kontak@supplier.co.id"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Alamat <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Jl. Raya Industri No. 1"
                      className="rounded-xl"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Kota <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Jakarta" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pic_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      PIC <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nama penanggung jawab"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Website <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://www.supplier.co.id"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Termin Pembayaran{" "}
                    <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Pilih termin" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                      <SelectItem value="">Tidak ada</SelectItem>
                      <SelectItem value="NET 30">NET 30</SelectItem>
                      <SelectItem value="NET 14">NET 14</SelectItem>
                      <SelectItem value="COD">COD</SelectItem>
                      <SelectItem value="NET 45">NET 45</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs font-semibold text-muted-foreground">Data Bank (opsional)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank</FormLabel>
                    <FormControl>
                      <Input placeholder="BCA" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. Rekening</FormLabel>
                    <FormControl>
                      <Input placeholder="Nomor rekening" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Atas Nama</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nama pemilik rekening"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="supplier-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="supplier-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Customer | null;
}) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const { data: customers } = useCustomers();
  const previewCode = nextCode(
    (customers?.data ?? []).map((c) => c.code),
    "CUS",
  );

  return (
    <CrudFormDialog<CustomerInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Customer" : "Tambah Customer"}
      description="Pembeli / pelanggan yang terdaftar di master data."
      schema={customerSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              legal_name: initial.legal_name ?? "",
              nib: initial.nib ?? "",
              npwp: initial.npwp ?? "",
              phone: initial.phone ?? "",
              email: initial.email ?? "",
              pic_name: initial.pic_name ?? "",
              website: initial.website ?? "",
              address: initial.address ?? "",
              city: initial.city ?? "",
              segment: (initial.segment ?? "") as CustomerInput["segment"],
              bank_name: initial.bank_name ?? "",
              bank_account_no: initial.bank_account_no ?? "",
              bank_account_name: initial.bank_account_name ?? "",
              is_active: initial.is_active,
            }
          : {
              code: "",
              name: "",
              legal_name: "",
              nib: "",
              npwp: "",
              phone: "",
              email: "",
              pic_name: "",
              website: "",
              address: "",
              city: "",
              segment: "",
              bank_name: "",
              bank_account_no: "",
              bank_account_name: "",
              is_active: true,
            }
      }
      onSubmit={async (values, form) => {
        const payload: CustomerPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const legalName = values.legal_name?.trim();
        if (legalName) payload.legal_name = legalName;
        const nib = values.nib?.trim();
        if (nib) payload.nib = nib;
        const npwp = values.npwp?.trim();
        if (npwp) payload.npwp = npwp;
        const phone = values.phone?.trim();
        if (phone) payload.phone = phone;
        const email = values.email?.trim();
        if (email) payload.email = email;
        const picName = values.pic_name?.trim();
        if (picName) payload.pic_name = picName;
        const website = values.website?.trim();
        if (website) payload.website = website;
        const address = values.address?.trim();
        if (address) payload.address = address;
        const city = values.city?.trim();
        if (city) payload.city = city;
        if (values.segment) payload.segment = values.segment;
        const bankName = values.bank_name?.trim();
        if (bankName) payload.bank_name = bankName;
        const bankAccountNo = values.bank_account_no?.trim();
        if (bankAccountNo) payload.bank_account_no = bankAccountNo;
        const bankAccountName = values.bank_account_name?.trim();
        if (bankAccountName) payload.bank_account_name = bankAccountName;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Customer diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Customer ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "email");
          rowField(form as never, err, "nib");
          rowField(form as never, err, "npwp");
          rowField(form as never, err, "website");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "email") &&
            !fieldError(err, "nib") &&
            !fieldError(err, "npwp") &&
            !fieldError(err, "website")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Customer</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Customer</FormLabel>
                  <FormControl>
                    <Input placeholder="Toko Sinar Terang" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nama Legal <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="PT Sinar Terang Perkasa"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nib"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NIB <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="13 digit" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="npwp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NPWP <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="15 atau 16 digit" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Telepon <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="021-777..." className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="sales@customer.co.id"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pic_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      PIC <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Nama kontak person" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Website <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://customer.co.id"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Alamat <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Jl. Pasar Raya No. 1"
                      className="rounded-xl"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Kota <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Jakarta" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="segment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Segmen <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Pilih segmen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                        <SelectItem value="">Tidak ada</SelectItem>
                        <SelectItem value="Retail">Retail</SelectItem>
                        <SelectItem value="Distributor">Distributor</SelectItem>
                        <SelectItem value="Proyek">Proyek</SelectItem>
                        <SelectItem value="Korporat">Korporat</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs font-semibold text-muted-foreground">Data Bank (opsional)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank</FormLabel>
                    <FormControl>
                      <Input placeholder="BCA" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. Rekening</FormLabel>
                    <FormControl>
                      <Input placeholder="Nomor rekening" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Atas Nama</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nama pemilik rekening"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="customer-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="customer-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function VendorFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Vendor | null;
}) {
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const { data: vendors } = useVendors();
  const previewCode = nextCode(
    (vendors?.data ?? []).map((v) => v.code),
    "VDR",
  );

  return (
    <CrudFormDialog<VendorInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Vendor" : "Tambah Vendor"}
      description="Penyedia jasa pendukung (ekspedisi, maintenance, kalibrasi, dll)."
      schema={vendorSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              legal_name: initial.legal_name ?? "",
              nib: initial.nib ?? "",
              npwp: initial.npwp ?? "",
              service_type: (initial.service_type ?? "") as VendorInput["service_type"],
              contact_phone: initial.contact_phone ?? "",
              email: initial.email ?? "",
              pic_name: initial.pic_name ?? "",
              website: initial.website ?? "",
              bank_name: initial.bank_name ?? "",
              bank_account_no: initial.bank_account_no ?? "",
              bank_account_name: initial.bank_account_name ?? "",
              is_active: initial.is_active,
            }
          : {
              code: "",
              name: "",
              legal_name: "",
              nib: "",
              npwp: "",
              service_type: "",
              contact_phone: "",
              email: "",
              pic_name: "",
              website: "",
              bank_name: "",
              bank_account_no: "",
              bank_account_name: "",
              is_active: true,
            }
      }
      onSubmit={async (values, form) => {
        const payload: VendorPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        const legalName = values.legal_name?.trim();
        if (legalName) payload.legal_name = legalName;
        const nib = values.nib?.trim();
        if (nib) payload.nib = nib;
        const npwp = values.npwp?.trim();
        if (npwp) payload.npwp = npwp;
        if (values.service_type) payload.service_type = values.service_type;
        const contact = values.contact_phone?.trim();
        if (contact) payload.contact_phone = contact;
        const email = values.email?.trim();
        if (email) payload.email = email;
        const picName = values.pic_name?.trim();
        if (picName) payload.pic_name = picName;
        const website = values.website?.trim();
        if (website) payload.website = website;
        const bankName = values.bank_name?.trim();
        if (bankName) payload.bank_name = bankName;
        const bankAccountNo = values.bank_account_no?.trim();
        if (bankAccountNo) payload.bank_account_no = bankAccountNo;
        const bankAccountName = values.bank_account_name?.trim();
        if (bankAccountName) payload.bank_account_name = bankAccountName;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Vendor diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Vendor ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "email");
          rowField(form as never, err, "nib");
          rowField(form as never, err, "npwp");
          rowField(form as never, err, "website");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "email") &&
            !fieldError(err, "nib") &&
            !fieldError(err, "npwp") &&
            !fieldError(err, "website")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Vendor</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Vendor</FormLabel>
                  <FormControl>
                    <Input placeholder="JNE Cabang Pusat" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nama Legal <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="PT Jalur Nugraha Ekakurir"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nib"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NIB <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="13 digit" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="npwp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      NPWP <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="15 atau 16 digit" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="service_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Jenis Layanan{" "}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Pilih layanan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                        <SelectItem value="">Tidak ada</SelectItem>
                        <SelectItem value="Ekspedisi">Ekspedisi</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Kalibrasi">Kalibrasi</SelectItem>
                        <SelectItem value="Cleaning">Cleaning</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Kontak <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="021-888..." className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="cs@vendor.co.id"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pic_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      PIC <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Nama kontak person" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Website <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="https://vendor.co.id" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs font-semibold text-muted-foreground">Data Bank (opsional)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank</FormLabel>
                    <FormControl>
                      <Input placeholder="BCA" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. Rekening</FormLabel>
                    <FormControl>
                      <Input placeholder="Nomor rekening" className="rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Atas Nama</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nama pemilik rekening"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="vendor-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="vendor-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function ItemFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ItemApi | null;
}) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const { data: cats, isLoading: catsLoading } = useCategories();
  const { data: subCats, isLoading: subCatsLoading } = useSubCategories();
  const { data: merks, isLoading: merksLoading } = useMerks();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: rackRows, isLoading: rackRowsLoading } = useRacks();
  const { data: binRows, isLoading: binRowsLoading } = useBins();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: items } = useItems();
  const previewInternal = nextCode(
    (items?.data ?? []).map((i) => i.internal_barcode).filter((c): c is string => c != null),
    "IB",
  );
  const previewSku = nextSku((items?.data ?? []).map((i) => i.sku));

  const defaultValues = useMemo<ItemInput>(
    () =>
      initial
        ? {
            sku: initial.sku,
            barcode: initial.barcode ?? "",
            internal_barcode: initial.internal_barcode ?? "",
            name: initial.name,
            category_id: initial.category_id,
            sub_category_id: initial.sub_category_id ?? "",
            brand_id: initial.brand_id ?? "",
            unit_id: initial.unit_id ?? "",
            default_warehouse_id: initial.default_warehouse_id ?? "",
            default_rack_id: initial.default_rack_id ?? "",
            default_bin_id: initial.default_bin_id ?? "",
            preferred_supplier_id: initial.preferred_supplier_id ?? "",
            cost: initial.cost,
            price: initial.price,
            min_stock: initial.min,
            max_stock: initial.max ?? undefined,
            lead_time: initial.leadTime,
            weight: initial.weight ?? undefined,
            dimension: initial.dimension ?? "",
            status: initial.status,
          }
        : {
            sku: previewSku,
            barcode: "",
            internal_barcode: "",
            name: "",
            category_id: 0,
            sub_category_id: "",
            brand_id: "",
            unit_id: "",
            default_warehouse_id: "",
            default_rack_id: "",
            default_bin_id: "",
            preferred_supplier_id: "",
            cost: 0,
            price: 0,
            min_stock: 0,
            max_stock: undefined,
            lead_time: 0,
            weight: undefined,
            dimension: "",
            status: "Aktif",
          },
    [initial, previewSku],
  );

  const toPayload = (v: ItemInput): ItemPayload => {
    const payload: ItemPayload = {
      sku: v.sku.trim(),
      barcode: v.barcode.trim() || null,
      name: v.name.trim(),
      category_id: v.category_id,
      cost: v.cost,
      price: v.price,
      min_stock: v.min_stock,
      lead_time: v.lead_time,
      dimension: v.dimension.trim() || null,
      status: v.status,
    };
    if (v.sub_category_id) payload.sub_category_id = v.sub_category_id;
    if (v.brand_id) payload.brand_id = v.brand_id;
    if (v.unit_id) payload.unit_id = v.unit_id;
    if (v.default_warehouse_id) payload.default_warehouse_id = v.default_warehouse_id;
    if (v.default_rack_id) payload.default_rack_id = v.default_rack_id;
    if (v.default_bin_id) payload.default_bin_id = v.default_bin_id;
    if (v.preferred_supplier_id) payload.preferred_supplier_id = v.preferred_supplier_id;
    if (v.max_stock != null) payload.max_stock = v.max_stock;
    if (v.weight != null) payload.weight = v.weight;
    return payload;
  };

  return (
    <CrudFormDialog<ItemInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Barang" : "Tambah Barang"}
      description="Data pokok barang: identitas, klasifikasi, dan harga."
      schema={itemSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={defaultValues}
      onSubmit={async (values, form) => {
        const payload = toPayload(values);
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Barang diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Barang ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          for (const f of [
            "sku",
            "barcode",
            "name",
            "category_id",
            "sub_category_id",
            "cost",
            "price",
          ] as const)
            rowField(form as never, err, f);
          if (
            ["sku", "barcode", "name", "category_id", "sub_category_id", "cost", "price"].every(
              (f) => !fieldError(err, f),
            )
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => {
        const selectedCat = form.watch("category_id");
        const subs = (subCats?.data ?? []).filter((s) => s.category_id === selectedCat);
        return (
          <Form {...form}>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="SKU-10001-001" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                      {!initial && (
                        <p className="text-xs text-muted-foreground">
                          Diisi otomatis dengan SKU berikutnya — bisa diubah.
                        </p>
                      )}
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Barcode{" "}
                        <span className="font-normal text-muted-foreground">(opsional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="8991..." className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="internal_barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode Internal</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled
                          placeholder="Otomatis dibuat sistem"
                          value={initial ? field.value : previewInternal}
                          className="rounded-xl font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Barang</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nama barang / material"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => {
                    const catOptions: ComboboxOption[] = (cats?.data ?? []).map((c) => ({
                      value: String(c.id),
                      label: c.name,
                      keywords: c.code,
                    }));
                    return (
                      <FormItem>
                        <FormLabel>Kategori</FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={String(field.value)}
                            onValueChange={(v) => field.onChange(Number(v))}
                            options={catOptions}
                            placeholder="Pilih kategori"
                            loading={catsLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="sub_category_id"
                  render={({ field }) => {
                    const subOptions: ComboboxOption[] = subs.map((s) => ({
                      value: String(s.id),
                      label: s.name,
                      keywords: s.code,
                    }));
                    return (
                      <FormItem>
                        <FormLabel>
                          Sub Kategori{" "}
                          <span className="font-normal text-muted-foreground">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                            options={subOptions}
                            placeholder="Pilih sub kategori"
                            allowEmpty
                            loading={subCatsLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="brand_id"
                  render={({ field }) => {
                    const merkOptions: ComboboxOption[] = (merks?.data ?? []).map((m) => ({
                      value: String(m.id),
                      label: m.name,
                      keywords: m.code,
                    }));
                    return (
                      <FormItem>
                        <FormLabel>
                          Merk <span className="font-normal text-muted-foreground">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                            options={merkOptions}
                            placeholder="Pilih merk"
                            allowEmpty
                            loading={merksLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="preferred_supplier_id"
                  render={({ field }) => {
                    const supplierOptions: ComboboxOption[] = (suppliers?.data ?? []).map((s) => ({
                      value: String(s.id),
                      label: s.name,
                      keywords: s.code,
                    }));
                    return (
                      <FormItem>
                        <FormLabel>
                          Supplier{" "}
                          <span className="font-normal text-muted-foreground">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                            options={supplierOptions}
                            placeholder="Pilih supplier"
                            allowEmpty
                            loading={suppliersLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="unit_id"
                  render={({ field }) => {
                    const unitOptions: ComboboxOption[] = (units?.data ?? []).map((u) => ({
                      value: String(u.id),
                      label: u.name,
                      keywords: u.code,
                    }));
                    return (
                      <FormItem>
                        <FormLabel>
                          Satuan{" "}
                          <span className="font-normal text-muted-foreground">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                            options={unitOptions}
                            placeholder="Pilih satuan"
                            allowEmpty
                            loading={unitsLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="default_warehouse_id"
                  render={({ field }) => {
                    const warehouseOptions: ComboboxOption[] = (warehouses?.data ?? []).map(
                      (w) => ({
                        value: String(w.id),
                        label: w.name,
                        keywords: w.code,
                      }),
                    );
                    return (
                      <FormItem>
                        <FormLabel>
                          Gudang Default{" "}
                          <span className="font-normal text-muted-foreground">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => {
                              field.onChange(v === "" ? "" : Number(v));
                              form.setValue("default_rack_id", "");
                              form.setValue("default_bin_id", "");
                            }}
                            options={warehouseOptions}
                            placeholder="Pilih gudang"
                            allowEmpty
                            loading={warehousesLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="default_rack_id"
                  render={({ field }) => {
                    const selectedWh = form.watch("default_warehouse_id");
                    const rackOptions: ComboboxOption[] = (rackRows?.data ?? [])
                      .filter((r) => r.warehouse_id === selectedWh)
                      .map((r) => ({
                        value: String(r.id),
                        label: `${r.code} — ${r.name} (${r.warehouse_name ?? "—"})`,
                        keywords: r.name,
                      }));
                    return (
                      <FormItem>
                        <FormLabel>Rak Default (opsional)</FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => {
                              field.onChange(v === "" ? "" : Number(v));
                              form.setValue("default_bin_id", "");
                            }}
                            options={rackOptions}
                            placeholder="Pilih rak"
                            allowEmpty
                            loading={rackRowsLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="default_bin_id"
                  render={({ field }) => {
                    const selectedRack = form.watch("default_rack_id");
                    const binOptions: ComboboxOption[] = (binRows?.data ?? [])
                      .filter((b) => b.rack_id === selectedRack)
                      .map((b) => ({
                        value: String(b.id),
                        label: `${b.full_address ?? b.code} — ${b.name}`,
                        keywords: `${b.code} ${b.rack_name ?? ""}`,
                      }));
                    return (
                      <FormItem>
                        <FormLabel>Bin Default (opsional)</FormLabel>
                        <FormControl>
                          <FormCombobox
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                            options={binOptions}
                            placeholder="Pilih bin"
                            allowEmpty
                            loading={binRowsLoading}
                            side="bottom"
                            avoidCollisions={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Harga Pokok (Rp)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="any" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Harga Jual (Rp)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="any" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="min_stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stok Minimum</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max_stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Stok Maksimum{" "}
                        <span className="font-normal text-muted-foreground">(opsional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          className="rounded-xl"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? undefined : Number(e.target.value),
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="lead_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Time (hari)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Berat (kg){" "}
                        <span className="font-normal text-muted-foreground">(opsional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="rounded-xl"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? undefined : Number(e.target.value),
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dimension"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Dimensi{" "}
                        <span className="font-normal text-muted-foreground">(opsional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="10 x 5 x 3 cm" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Pilih status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                        <SelectItem value="Aktif">Aktif</SelectItem>
                        <SelectItem value="Nonaktif">Nonaktif</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        );
      }}
    />
  );
}

export function DepartmentFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Department | null;
}) {
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const { data: departments } = useDepartments();
  const { data: users, isLoading: usersLoading } = useUsers();
  const previewCode = nextCode(
    (departments?.data ?? []).map((d) => d.code),
    "DEP",
  );

  return (
    <CrudFormDialog<DepartmentInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Departemen" : "Tambah Departemen"}
      description="Unit kerja peminta barang di dalam perusahaan."
      schema={departmentSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              head_user_id: initial.head_user_id ?? "",
              is_active: initial.is_active,
            }
          : { code: "", name: "", head_user_id: "", is_active: true }
      }
      onSubmit={async (values, form) => {
        const payload: DepartmentPayload = {
          name: values.name.trim(),
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        if (values.head_user_id) payload.head_user_id = values.head_user_id;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Departemen diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Departemen ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "head_user_id");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "head_user_id")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Departemen</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Departemen</FormLabel>
                  <FormControl>
                    <Input placeholder="Produksi" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="head_user_id"
              render={({ field }) => {
                const userOptions: ComboboxOption[] = (users?.data ?? []).map((u) => ({
                  value: String(u.id),
                  label: u.name,
                  keywords: u.code,
                }));
                return (
                  <FormItem>
                    <FormLabel>
                      Kepala <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value ?? "")}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                        options={userOptions}
                        placeholder="Pilih kepala"
                        allowEmpty
                        loading={usersLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="department-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="department-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Project | null;
}) {
  const create = useCreateProject();
  const update = useUpdateProject();
  const { data: projects } = useProjects();
  const { data: users, isLoading: usersLoading } = useUsers();
  const previewCode = nextCode(
    (projects?.data ?? []).map((p) => p.code),
    "PRJ",
  );

  return (
    <CrudFormDialog<ProjectInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Proyek" : "Tambah Proyek"}
      description="Proyek pemakaian material produksi."
      schema={projectSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              pic_user_id: initial.pic_user_id ?? "",
              start_date: initial.start_date ?? "",
              end_date: initial.end_date ?? "",
              status: initial.status as ProjectInput["status"],
              budget: initial.budget ?? undefined,
            }
          : {
              code: "",
              name: "",
              pic_user_id: "",
              start_date: "",
              end_date: "",
              status: "Perencanaan",
              budget: undefined,
            }
      }
      onSubmit={async (values, form) => {
        const payload: ProjectPayload = {
          name: values.name.trim(),
          status: values.status,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        if (values.pic_user_id) payload.pic_user_id = values.pic_user_id;
        if (values.start_date) payload.start_date = values.start_date;
        if (values.end_date) payload.end_date = values.end_date;
        if (values.budget != null) payload.budget = values.budget;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Proyek diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Proyek ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "pic_user_id");
          rowField(form as never, err, "budget");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "pic_user_id") &&
            !fieldError(err, "budget")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode Proyek</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Proyek</FormLabel>
                  <FormControl>
                    <Input placeholder="Proyek Tol Cisumdawu" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pic_user_id"
              render={({ field }) => {
                const userOptions: ComboboxOption[] = (users?.data ?? []).map((u) => ({
                  value: String(u.id),
                  label: u.name,
                  keywords: u.code,
                }));
                return (
                  <FormItem>
                    <FormLabel>
                      PIC <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value ?? "")}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                        options={userOptions}
                        placeholder="Pilih PIC"
                        allowEmpty
                        loading={usersLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tanggal Mulai{" "}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="rounded-xl"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tanggal Selesai{" "}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="rounded-xl"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                      <SelectItem value="Perencanaan">Perencanaan</SelectItem>
                      <SelectItem value="Berjalan">Berjalan</SelectItem>
                      <SelectItem value="Selesai">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Anggaran <span className="font-normal text-muted-foreground">(opsional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="1000"
                      placeholder="250000000"
                      className="rounded-xl"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function WorkOrderFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: WorkOrder | null;
}) {
  const create = useCreateWorkOrder();
  const update = useUpdateWorkOrder();
  const { data: workOrders } = useWorkOrders();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: users, isLoading: usersLoading } = useUsers();
  const previewNo = nextYearlyCode(
    (workOrders?.data ?? []).map((w) => w.no),
    "WO",
  );

  return (
    <CrudFormDialog<WorkOrderInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Work Order" : "Tambah Work Order"}
      description="Perintah kerja produksi pemakai material."
      schema={workOrderSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              no: initial.no,
              project_id: initial.project_id,
              item_id: initial.item_id,
              unit_id: initial.unit_id ?? "",
              target_qty: initial.target_qty,
              start_date: initial.start_date ?? "",
              finish_date: initial.finish_date ?? "",
              pic_user_id: initial.pic_user_id ?? "",
              status: initial.status as WorkOrderInput["status"],
            }
          : {
              no: "",
              project_id: 0,
              item_id: 0,
              unit_id: "",
              target_qty: 1,
              start_date: "",
              finish_date: "",
              pic_user_id: "",
              status: "Perencanaan",
            }
      }
      onSubmit={async (values, form) => {
        const payload: WorkOrderPayload = {
          project_id: values.project_id,
          item_id: values.item_id,
          target_qty: values.target_qty,
          status: values.status,
        };
        const no = values.no?.trim();
        if (initial && no) payload.no = no;
        if (values.unit_id) payload.unit_id = values.unit_id;
        if (values.start_date) payload.start_date = values.start_date;
        if (values.finish_date) payload.finish_date = values.finish_date;
        if (values.pic_user_id) payload.pic_user_id = values.pic_user_id;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...payload });
            toast.success("Work order diperbarui");
          } else {
            await create.mutateAsync(payload);
            toast.success("Work order ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "no");
          rowField(form as never, err, "project_id");
          rowField(form as never, err, "item_id");
          rowField(form as never, err, "target_qty");
          if (
            !fieldError(err, "no") &&
            !fieldError(err, "project_id") &&
            !fieldError(err, "item_id") &&
            !fieldError(err, "target_qty")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="no"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor WO</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewNo}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="project_id"
              render={({ field }) => {
                const projectOptions: ComboboxOption[] = (projects?.data ?? []).map((p) => ({
                  value: String(p.id),
                  label: p.name,
                  keywords: p.code,
                }));
                return (
                  <FormItem>
                    <FormLabel>Proyek</FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                        options={projectOptions}
                        placeholder="Pilih proyek"
                        loading={projectsLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="item_id"
              render={({ field }) => {
                const itemOptions: ComboboxOption[] = (items?.data ?? []).map((it) => ({
                  value: String(it.id),
                  label: it.name,
                  keywords: [it.sku, it.internal_barcode].filter(Boolean).join(" "),
                }));
                return (
                  <FormItem>
                    <FormLabel>Produk / Barang</FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                        options={itemOptions}
                        placeholder="Pilih barang"
                        loading={itemsLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit_id"
                render={({ field }) => {
                  const unitOptions: ComboboxOption[] = (units?.data ?? []).map((u) => ({
                    value: String(u.id),
                    label: u.name,
                    keywords: u.code,
                  }));
                  return (
                    <FormItem>
                      <FormLabel>
                        Satuan <span className="font-normal text-muted-foreground">(opsional)</span>
                      </FormLabel>
                      <FormControl>
                        <FormCombobox
                          value={String(field.value ?? "")}
                          onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                          options={unitOptions}
                          placeholder="Pilih satuan"
                          allowEmpty
                          loading={unitsLoading}
                          side="bottom"
                          avoidCollisions={false}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="target_qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Qty</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        className="rounded-xl"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tanggal Mulai{" "}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="rounded-xl"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="finish_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tanggal Selesai{" "}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="rounded-xl"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="pic_user_id"
              render={({ field }) => {
                const userOptions: ComboboxOption[] = (users?.data ?? []).map((u) => ({
                  value: String(u.id),
                  label: u.name,
                  keywords: u.code,
                }));
                return (
                  <FormItem>
                    <FormLabel>
                      PIC <span className="font-normal text-muted-foreground">(opsional)</span>
                    </FormLabel>
                    <FormControl>
                      <FormCombobox
                        value={String(field.value ?? "")}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                        options={userOptions}
                        placeholder="Pilih PIC"
                        allowEmpty
                        loading={usersLoading}
                        side="bottom"
                        avoidCollisions={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                      <SelectItem value="Perencanaan">Perencanaan</SelectItem>
                      <SelectItem value="Berjalan">Berjalan</SelectItem>
                      <SelectItem value="Selesai">Selesai</SelectItem>
                      <SelectItem value="Ditunda">Ditunda</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function UserFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MasterUser | null;
}) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const { data: users } = useUsers();
  const previewCode = nextCode(
    (users?.data ?? []).map((u) => u.code),
    "USR",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  return (
    <CrudFormDialog<UserInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit User" : "Tambah User"}
      description="Akun pengguna aplikasi gudang."
      schema={initial ? updateUserSchema : createUserSchema}
      resetKey={initial ? `edit-${initial.id}` : "create"}
      defaultValues={
        initial
          ? {
              code: initial.code,
              name: initial.name,
              email: initial.email ?? "",
              role: initial.role as UserInput["role"],
              password: "",
              password_confirmation: "",
              is_active: initial.is_active,
            }
          : {
              code: "",
              name: "",
              email: "",
              role: "Operator Gudang",
              password: "",
              password_confirmation: "",
              is_active: true,
            }
      }
      onSubmit={async (values, form) => {
        const payload: UserPayload = {
          name: values.name.trim(),
          email: values.email.trim(),
          role: values.role,
          is_active: values.is_active,
        };
        const code = values.code?.trim();
        if (initial && code) payload.code = code;
        if (values.password) payload.password = values.password;
        const body = values.password
          ? { ...payload, password_confirmation: values.password_confirmation }
          : payload;
        try {
          if (initial) {
            await update.mutateAsync({ id: initial.id, ...body });
            toast.success("User diperbarui");
          } else {
            await create.mutateAsync(body);
            toast.success("User ditambahkan");
          }
          onOpenChange(false);
        } catch (err) {
          rowField(form as never, err, "code");
          rowField(form as never, err, "name");
          rowField(form as never, err, "email");
          rowField(form as never, err, "role");
          rowField(form as never, err, "password");
          if (
            !fieldError(err, "code") &&
            !fieldError(err, "name") &&
            !fieldError(err, "email") &&
            !fieldError(err, "role") &&
            !fieldError(err, "password")
          )
            toast.error((err as Error).message);
        }
      }}
      renderFields={(form) => (
        <Form {...form}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode User</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      value={initial ? field.value : previewCode}
                      className="rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama User</FormLabel>
                  <FormControl>
                    <Input placeholder="Rudi Hartono" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="nama@kelolagudang.id"
                      className="rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Pilih role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl" side="bottom" avoidCollisions={false}>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={initial ? "Kosongkan jika tidak diubah" : "Minimal 8 karakter"}
                  className="rounded-xl pr-11"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password?.message && (
                <p className="text-[0.8rem] font-medium text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Konfirmasi Password</Label>
              <div className="relative">
                <Input
                  type={showPasswordConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={initial ? "Kosongkan jika tidak diubah" : "Ulangi password"}
                  className="rounded-xl pr-11"
                  {...form.register("password_confirmation")}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm((s) => !s)}
                  aria-label={
                    showPasswordConfirm
                      ? "Sembunyikan konfirmasi password"
                      : "Tampilkan konfirmasi password"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPasswordConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.formState.errors.password_confirmation?.message && (
                <p className="text-[0.8rem] font-medium text-destructive">
                  {form.formState.errors.password_confirmation.message}
                </p>
              )}
            </div>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <Label htmlFor="user-active">Aktif</Label>
                  <FormControl>
                    <Switch
                      id="user-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
      )}
    />
  );
}

export function RoleEditDialog({
  role,
  onOpenChange,
}: {
  role: RoleCatalog | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateRole();
  const [draft, setDraft] = useState<Record<string, AccessLevel | null>>({});
  const [canApprove, setCanApprove] = useState(false);

  useEffect(() => {
    if (role) {
      const next: Record<string, AccessLevel | null> = {};
      for (const module of ACCESS_MODULES) next[module] = null;
      for (const entry of role.access) next[entry.module] = entry.level;
      setDraft(next);
      setCanApprove(role.access.some((a) => a.module === "Approval Pengadaan"));
    }
  }, [role]);

  const open = role !== null;
  const saving = update.isPending;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!role) return;

    const access: RoleAccessEntry[] = ACCESS_MODULES.filter(
      (m) => m !== "Approval Pengadaan",
    ).flatMap((module) => {
      const level = draft[module];
      return level ? [{ module, level }] : [];
    });
    if (canApprove) access.push({ module: "Approval Pengadaan", level: "Kelola" });

    try {
      await update.mutateAsync({ role: role.name, access });
      toast.success("Hak akses role diperbarui");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>Edit Hak Akses — {role?.name}</DialogTitle>
          <DialogDescription>Atur tingkat akses tiap modul untuk role ini.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-border">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Modul</span>
              <span className="w-32 text-right">Hak Akses</span>
            </div>
            {ACCESS_MODULES.filter((m) => m !== "Approval Pengadaan").map((module) => (
              <div
                key={module}
                className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-2 last:border-0"
              >
                <span className="text-sm">{module}</span>
                <Select
                  value={draft[module] ?? "NONE"}
                  onValueChange={(value) =>
                    setDraft((draft) => ({
                      ...draft,
                      [module]: value === "NONE" ? null : (value as AccessLevel),
                    }))
                  }
                >
                  <SelectTrigger className="w-32 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="bottom" avoidCollisions={false}>
                    <SelectItem value="NONE">Tidak Ada</SelectItem>
                    {ACCESS_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="role-can-approve" className="text-sm font-medium">
                Approval Pengadaan
              </Label>
              <p className="text-xs text-muted-foreground">
                Role ini dapat menyetujui/menolak dokumen pengadaan (PR/PO).
              </p>
            </div>
            <Checkbox
              id="role-can-approve"
              checked={canApprove}
              onCheckedChange={(value) => setCanApprove(value === true)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
