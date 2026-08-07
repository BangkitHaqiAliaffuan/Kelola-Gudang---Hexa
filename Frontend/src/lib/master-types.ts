// Types mirroring the Laravel API resources (App\Http\Resources\*).
// The API serializes items to match the legacy wms-data `Item` shape so shared
// helpers (stockStatus, stockCard) keep working.

export type Category = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sub_category_count?: number;
  created_at: string;
  updated_at: string;
};

export type SubCategory = {
  id: number;
  category_id: number;
  category_name?: string | null;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Merk = {
  id: number;
  code: string;
  name: string;
  country: string | null;
  is_active: boolean;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type Unit = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type Warehouse = {
  id: number;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  is_active: boolean;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type Rack = {
  id: number;
  warehouse_id: number;
  warehouse_name?: string | null;
  code: string;
  name: string;
  is_active: boolean;
  bin_count?: number;
  created_at: string;
  updated_at: string;
};

export type Bin = {
  id: number;
  rack_id: number;
  rack_name?: string | null;
  warehouse_name?: string | null;
  code: string;
  name: string;
  is_active: boolean;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type ItemApi = {
  id: number;
  sku: string;
  barcode: string | null;
  internal_barcode: string | null;
  name: string;
  category: string | null;
  category_id: number;
  subCategory: string | null;
  sub_category_id: number | null;
  brand_id: number | null;
  unit_id: number | null;
  default_warehouse_id: number | null;
  default_rack_id: number | null;
  default_bin_id: number | null;
  // Reference tables ship with later master-data phases — null until then.
  brand: string | null;
  supplier: string | null;
  warehouse: string | null;
  rack: string | null;
  bin: string | null;
  unit: string | null;
  stock: number;
  reserved: number;
  cost: number;
  price: number;
  min: number;
  max: number | null;
  weight: number | null;
  dimension: string | null;
  leadTime: number;
  status: "Aktif" | "Nonaktif";
  image_url: string | null;
  created_at: string;
  updated_at: string;
};
