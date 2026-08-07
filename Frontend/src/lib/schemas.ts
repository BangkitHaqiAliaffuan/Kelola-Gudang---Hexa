import { z } from "zod";

// Zod schemas mirroring the backend FormRequest validation (app/Http/Requests).

const code = z.string().trim().max(20, "Maksimal 20 karakter").optional();
const name = z.string().trim().min(1, "Nama wajib diisi").max(150, "Maksimal 150 karakter");

function luhn(number: string): boolean {
  let sum = 0;
  const parity = number.length % 2;
  for (let i = 0; i < number.length; i++) {
    let digit = Number(number[i]);
    if (i % 2 === parity) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// Mirrors App\Support\Npwp::isValid in the backend.
function isValidNpwp(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 15) return luhn(digits.slice(0, 9));
  if (digits.length === 16) return digits[0] === "0" ? luhn(digits.slice(0, 10)) : true;
  return false;
}

const optionalText = (max: number) =>
  z.string().trim().max(max, `Maksimal ${max} karakter`).optional().or(z.literal(""));
const optionalRegex = (pattern: RegExp, message: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .regex(pattern, message)
    .optional()
    .or(z.literal(""));

const npwp = optionalText(20).refine(
  (v) => !v || isValidNpwp(v),
  "Format NPWP tidak valid (15/16 digit dengan checksum yang benar)",
);
const nib = optionalRegex(/^\d{13}$/, "NIB harus 13 digit angka", 13);
const website = optionalRegex(
  /^https?:\/\/.+\..+/,
  "Format URL tidak valid (mis. https://...)",
  255,
);

export const categorySchema = z.object({
  code,
  name,
  description: z.string().trim().max(500, "Maksimal 500 karakter").default(""),
  is_active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const subCategorySchema = z.object({
  category_id: z.coerce.number().int().positive("Kategori wajib dipilih"),
  code,
  name,
  is_active: z.boolean().default(true),
});
export type SubCategoryInput = z.infer<typeof subCategorySchema>;

export const merkSchema = z.object({
  code,
  name,
  country: z.string().trim().max(100, "Maksimal 100 karakter").default(""),
  is_active: z.boolean().default(true),
});
export type MerkInput = z.infer<typeof merkSchema>;

export const unitSchema = z.object({
  code,
  name: z.string().trim().min(1, "Nama wajib diisi").max(50, "Maksimal 50 karakter"),
  is_active: z.boolean().default(true),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const warehouseSchema = z.object({
  code,
  name,
  city: z.string().trim().max(100, "Maksimal 100 karakter").default(""),
  address: z.string().trim().max(255, "Maksimal 255 karakter").default(""),
  is_active: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const rackSchema = z.object({
  warehouse_id: z.coerce.number().int().positive("Gudang wajib dipilih"),
  aisle: z
    .string()
    .trim()
    .regex(/^[A-Za-z]$/, "Satu huruf (A–Z)"),
  bay: z
    .string()
    .trim()
    .regex(/^\d{2}$/, "Dua digit (contoh: 03)"),
  name: optionalText(150),
  is_active: z.boolean().default(true),
});
export type RackInput = z.infer<typeof rackSchema>;

export const binSchema = z.object({
  rack_id: z.coerce.number().int().positive("Rak wajib dipilih"),
  level: z
    .string()
    .trim()
    .regex(/^\d{2}$/, "Dua digit (contoh: 01)"),
  position: z
    .string()
    .trim()
    .regex(/^\d{2}$/, "Dua digit (contoh: 02)"),
  name,
  is_active: z.boolean().default(true),
});
export type BinInput = z.infer<typeof binSchema>;

const phone = z.string().trim().max(20, "Maksimal 20 karakter").optional().or(z.literal(""));
const email = z
  .string()
  .trim()
  .email("Format email tidak valid")
  .max(150, "Maksimal 150 karakter")
  .optional()
  .or(z.literal(""));

export const supplierSchema = z.object({
  code,
  name,
  legal_name: optionalText(200),
  nib,
  phone,
  email,
  pic_name: optionalText(150),
  website,
  address: optionalText(255),
  city: optionalText(100),
  npwp,
  payment_terms: z.union([z.enum(["NET 30", "NET 14", "COD", "NET 45"]), z.literal("")]).optional(),
  bank_name: optionalText(100),
  bank_account_no: optionalText(50),
  bank_account_name: optionalText(150),
  is_active: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const customerSchema = z.object({
  code,
  name,
  legal_name: optionalText(200),
  nib,
  npwp,
  phone,
  email,
  pic_name: optionalText(150),
  website,
  address: optionalText(255),
  city: optionalText(100),
  segment: z
    .union([z.enum(["Retail", "Distributor", "Proyek", "Korporat"]), z.literal("")])
    .optional(),
  bank_name: optionalText(100),
  bank_account_no: optionalText(50),
  bank_account_name: optionalText(150),
  is_active: z.boolean().default(true),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const vendorSchema = z.object({
  code,
  name,
  legal_name: optionalText(200),
  nib,
  npwp,
  service_type: z
    .union([z.enum(["Ekspedisi", "Maintenance", "Kalibrasi", "Cleaning"]), z.literal("")])
    .optional(),
  contact_phone: phone,
  email,
  pic_name: optionalText(150),
  website,
  bank_name: optionalText(100),
  bank_account_no: optionalText(50),
  bank_account_name: optionalText(150),
  is_active: z.boolean().default(true),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const itemSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU wajib diisi").max(30, "Maksimal 30 karakter"),
    barcode: z.string().trim().max(30, "Maksimal 30 karakter").default(""),
    internal_barcode: z.string().trim().max(30, "Maksimal 30 karakter").optional(),
    name: z.string().trim().min(1, "Nama barang wajib diisi").max(200, "Maksimal 200 karakter"),
    category_id: z.coerce.number().int().positive("Kategori wajib dipilih"),
    sub_category_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    brand_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    unit_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    default_warehouse_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    default_rack_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    default_bin_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    preferred_supplier_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    cost: z.coerce
      .number({ invalid_type_error: "Harga pokok wajib diisi" })
      .min(0, "Tidak boleh negatif"),
    price: z.coerce
      .number({ invalid_type_error: "Harga jual wajib diisi" })
      .min(0, "Tidak boleh negatif"),
    min_stock: z.coerce.number().int().min(0).default(0),
    max_stock: z.coerce.number().int().min(0).optional(),
    lead_time: z.coerce.number().int().min(0).default(0),
    weight: z.coerce.number().min(0).optional(),
    dimension: z.string().trim().max(60, "Maksimal 60 karakter").default(""),
    status: z.enum(["Aktif", "Nonaktif"]),
  })
  .refine((v) => v.max_stock == null || v.max_stock >= v.min_stock, {
    message: "Stok maksimum tidak boleh kurang dari stok minimum",
    path: ["max_stock"],
  });
export type ItemInput = z.infer<typeof itemSchema>;

const nullableFk = z.union([z.coerce.number().int().positive(), z.literal("")]).optional();
const dateInput = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"), z.literal("")])
  .optional();

export const departmentSchema = z.object({
  code,
  name,
  head_user_id: nullableFk,
  is_active: z.boolean().default(true),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const projectSchema = z.object({
  code,
  name,
  pic_user_id: nullableFk,
  start_date: dateInput,
  end_date: dateInput,
  status: z.enum(["Perencanaan", "Berjalan", "Selesai"]).default("Perencanaan"),
  budget: z.coerce.number().min(0).optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const workOrderSchema = z.object({
  no: z.string().trim().max(30, "Maksimal 30 karakter").optional(),
  project_id: z.coerce.number().int().positive("Proyek wajib dipilih"),
  item_id: z.coerce.number().int().positive("Barang wajib dipilih"),
  unit_id: nullableFk,
  target_qty: z.coerce.number().int().min(1, "Minimal 1"),
  start_date: dateInput,
  finish_date: dateInput,
  pic_user_id: nullableFk,
  status: z.enum(["Perencanaan", "Berjalan", "Selesai", "Ditunda"]).default("Perencanaan"),
});
export type WorkOrderInput = z.infer<typeof workOrderSchema>;
