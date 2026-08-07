import { toast } from "sonner";
import { useMemo } from "react";
import { CrudFormDialog } from "./master-crud";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  categorySchema,
  itemSchema,
  merkSchema,
  subCategorySchema,
  unitSchema,
  warehouseSchema,
  type CategoryInput,
  type ItemInput,
  type MerkInput,
  type SubCategoryInput,
  type UnitInput,
  type WarehouseInput,
} from "@/lib/schemas";
import { fieldError } from "@/lib/api";
import {
  useCategories,
  useCreateCategory,
  useCreateItem,
  useCreateMerk,
  useCreateSubCategory,
  useCreateUnit,
  useCreateWarehouse,
  useMerks,
  useSubCategories,
  useUnits,
  useUpdateCategory,
  useUpdateItem,
  useUpdateMerk,
  useUpdateSubCategory,
  useUpdateUnit,
  useUpdateWarehouse,
  useWarehouses,
  type CategoryPayload,
  type ItemPayload,
  type MerkPayload,
  type SubCategoryPayload,
  type UnitPayload,
  type WarehousePayload,
} from "@/hooks/use-master";
import type { Category, ItemApi, Merk, SubCategory, Unit, Warehouse } from "@/lib/master-types";

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
                  <FormLabel>Deskripsi</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Opsional" className="rounded-xl" rows={3} {...field} />
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
  const { data: cats } = useCategories();
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Induk Kategori</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72 rounded-xl">
                      {cats?.data.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
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
                  <FormLabel>Negara</FormLabel>
                  <FormControl>
                    <Input placeholder="Opsional" className="rounded-xl" {...field} />
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
                  <FormLabel>Kota</FormLabel>
                  <FormControl>
                    <Input placeholder="Opsional" className="rounded-xl" {...field} />
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
                  <FormLabel>Alamat</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Opsional" className="rounded-xl" rows={2} {...field} />
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
  const { data: cats } = useCategories();
  const { data: subCats } = useSubCategories();
  const { data: merks } = useMerks();
  const { data: units } = useUnits();
  const { data: warehouses } = useWarehouses();

  const defaultValues = useMemo<ItemInput>(
    () =>
      initial
        ? {
            sku: initial.sku,
            barcode: initial.barcode ?? "",
            name: initial.name,
            category_id: initial.category_id,
            sub_category_id: initial.sub_category_id ?? "",
            brand_id: initial.brand_id ?? "",
            unit_id: initial.unit_id ?? "",
            default_warehouse_id: initial.default_warehouse_id ?? "",
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
            sku: "",
            barcode: "",
            name: "",
            category_id: 0,
            sub_category_id: "",
            brand_id: "",
            unit_id: "",
            default_warehouse_id: "",
            cost: 0,
            price: 0,
            min_stock: 0,
            max_stock: undefined,
            lead_time: 0,
            weight: undefined,
            dimension: "",
            status: "Aktif",
          },
    [initial],
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
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode</FormLabel>
                      <FormControl>
                        <Input placeholder="8991..." className="rounded-xl" {...field} />
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategori</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Pilih kategori" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72 rounded-xl">
                          {cats?.data.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sub_category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sub Kategori</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Pilih sub kategori" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72 rounded-xl">
                          <SelectItem value="">Tidak ada</SelectItem>
                          {subs.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brand_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Merk</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Pilih merk" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72 rounded-xl">
                          <SelectItem value="">Tidak ada</SelectItem>
                          {merks?.data.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="unit_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Satuan</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Pilih satuan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72 rounded-xl">
                          <SelectItem value="">Tidak ada</SelectItem>
                          {units?.data.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_warehouse_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gudang Default</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v === "" ? "" : Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Pilih gudang" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72 rounded-xl">
                          <SelectItem value="">Tidak ada</SelectItem>
                          {warehouses?.data.map((w) => (
                            <SelectItem key={w.id} value={String(w.id)}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
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
                      <FormLabel>Stok Maksimum</FormLabel>
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
                      <FormLabel>Berat (kg)</FormLabel>
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
                      <FormLabel>Dimensi</FormLabel>
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
                      <SelectContent className="rounded-xl">
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
