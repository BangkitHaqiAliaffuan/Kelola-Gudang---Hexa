import { z } from "zod";

// Zod schemas mirroring the backend FormRequest validation (app/Http/Requests).

const code = z.string().trim().max(20, "Maksimal 20 karakter").optional();
const name = z.string().trim().min(1, "Nama wajib diisi").max(150, "Maksimal 150 karakter");

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

export const itemSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU wajib diisi").max(30, "Maksimal 30 karakter"),
    barcode: z.string().trim().max(30, "Maksimal 30 karakter").default(""),
    name: z.string().trim().min(1, "Nama barang wajib diisi").max(200, "Maksimal 200 karakter"),
    category_id: z.coerce.number().int().positive("Kategori wajib dipilih"),
    sub_category_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    brand_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    unit_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    default_warehouse_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
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
