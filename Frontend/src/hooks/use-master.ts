import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { RoleAccessEntry } from "@/lib/schemas";
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

// Data volume is small, so fetch everything and let the UI (DataTable)
// paginate + filter client-side, matching the existing UX. 10000 covers the
// largest dataset today (bins, ~578 rows) with ample headroom — matches the
// DOCS_PER_PAGE convention used by use-purchase-order.ts / use-persediaan.ts.
const PER_PAGE = 10000;

const keys = {
  categories: ["master", "categories"] as const,
  subCategories: ["master", "sub-categories"] as const,
  merks: ["master", "merks"] as const,
  units: ["master", "units"] as const,
  warehouses: ["master", "warehouses"] as const,
  racks: ["master", "racks"] as const,
  bins: ["master", "bins"] as const,
  suppliers: ["master", "suppliers"] as const,
  customers: ["master", "customers"] as const,
  vendors: ["master", "vendors"] as const,
  users: ["master", "users"] as const,
  roles: ["master", "roles"] as const,
  departments: ["master", "departments"] as const,
  projects: ["master", "projects"] as const,
  workOrders: ["master", "work-orders"] as const,
  items: ["master", "items"] as const,
  item: (id: number) => ["master", "items", id] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => api.get<Paginated<Category>>(`/master/categories?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useSubCategories() {
  return useQuery({
    queryKey: keys.subCategories,
    queryFn: () => api.get<Paginated<SubCategory>>(`/master/sub-categories?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useMerks() {
  return useQuery({
    queryKey: keys.merks,
    queryFn: () => api.get<Paginated<Merk>>(`/master/merks?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useUnits() {
  return useQuery({
    queryKey: keys.units,
    queryFn: () => api.get<Paginated<Unit>>(`/master/units?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: keys.warehouses,
    queryFn: () => api.get<Paginated<Warehouse>>(`/master/warehouses?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useRacks() {
  return useQuery({
    queryKey: keys.racks,
    queryFn: () => api.get<Paginated<Rack>>(`/master/racks?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useBins() {
  return useQuery({
    queryKey: keys.bins,
    queryFn: () => api.get<Paginated<Bin>>(`/master/bins?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useItems() {
  return useQuery({
    queryKey: keys.items,
    queryFn: () => api.get<Paginated<ItemApi>>(`/master/items?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: keys.suppliers,
    queryFn: () => api.get<Paginated<Supplier>>(`/master/suppliers?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: keys.customers,
    queryFn: () => api.get<Paginated<Customer>>(`/master/customers?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useVendors() {
  return useQuery({
    queryKey: keys.vendors,
    queryFn: () => api.get<Paginated<Vendor>>(`/master/vendors?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: () => api.get<Paginated<MasterUser>>(`/master/users?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useRoles() {
  return useQuery({
    queryKey: keys.roles,
    queryFn: () => api.get<{ data: RoleCatalog[] }>("/master/roles"),
    enabled: typeof window !== "undefined",
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export type RolePermissionPayload = {
  role: string;
  access: RoleAccessEntry[];
};

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, access }: RolePermissionPayload) =>
      api.put<{ data: RoleCatalog }>(`/master/roles/${encodeURIComponent(role)}`, { access }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.roles });
      await qc.refetchQueries({ queryKey: keys.roles });
      await qc.invalidateQueries({ queryKey: keys.users });
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: keys.departments,
    queryFn: () => api.get<Paginated<Department>>(`/master/departments?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api.get<Paginated<Project>>(`/master/projects?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useWorkOrders() {
  return useQuery({
    queryKey: keys.workOrders,
    queryFn: () => api.get<Paginated<WorkOrder>>(`/master/work-orders?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useItem(id: number | undefined) {
  return useQuery({
    queryKey: keys.item(id ?? 0),
    queryFn: () => api.get<{ data: ItemApi }>(`/master/items/${id}`),
    enabled: id != null && typeof window !== "undefined",
  });
}

export type CategoryPayload = {
  code?: string;
  name: string;
  description?: string;
  is_active: boolean;
};

export type SubCategoryPayload = {
  category_id: number;
  code?: string;
  name: string;
  is_active: boolean;
};

export type MerkPayload = {
  code?: string;
  name: string;
  country?: string;
  is_active: boolean;
};

export type UnitPayload = {
  code?: string;
  name: string;
  is_active: boolean;
};

export type WarehousePayload = {
  code?: string;
  name: string;
  city?: string;
  address?: string;
  is_active: boolean;
};

export type RackPayload = {
  warehouse_id: number;
  aisle: string;
  bay: string;
  name: string;
  is_active: boolean;
};

export type BinPayload = {
  rack_id: number;
  level: string;
  position: string;
  name: string;
  is_active: boolean;
};

export type SupplierPayload = {
  code?: string;
  name: string;
  legal_name?: string;
  nib?: string;
  phone?: string;
  email?: string;
  pic_name?: string;
  website?: string;
  address?: string;
  city?: string;
  npwp?: string;
  payment_terms?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  is_active: boolean;
};

export type CustomerPayload = {
  code?: string;
  name: string;
  legal_name?: string;
  nib?: string;
  npwp?: string;
  phone?: string;
  email?: string;
  pic_name?: string;
  website?: string;
  address?: string;
  city?: string;
  segment?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  is_active: boolean;
};

export type VendorPayload = {
  code?: string;
  name: string;
  legal_name?: string;
  nib?: string;
  npwp?: string;
  service_type?: string;
  contact_phone?: string;
  email?: string;
  pic_name?: string;
  website?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  is_active: boolean;
};

export type DepartmentPayload = {
  code?: string;
  name: string;
  head_user_id?: number;
  is_active: boolean;
};

export type ProjectPayload = {
  code?: string;
  name: string;
  pic_user_id?: number;
  vendor_id?: number | null;
  start_date?: string;
  end_date?: string;
  status?: string;
  budget?: number;
};

export type WorkOrderPayload = {
  no?: string;
  project_id: number;
  item_id: number;
  unit_id?: number;
  target_qty: number;
  start_date?: string;
  finish_date?: string;
  pic_user_id?: number;
  status?: string;
};

export type ItemPayload = {
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number;
  sub_category_id?: number;
  brand_id?: number;
  unit_id?: number;
  default_warehouse_id?: number;
  default_rack_id?: number;
  default_bin_id?: number;
  preferred_supplier_id?: number;
  cost: number;
  price: number;
  min_stock: number;
  max_stock?: number;
  lead_time: number;
  weight?: number;
  dimension: string | null;
  status: "Aktif" | "Nonaktif";
};

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CategoryPayload) =>
      api.post<{ data: Category }>("/master/categories", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: CategoryPayload & { id: number }) =>
      api.put<{ data: Category }>(`/master/categories/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useCreateSubCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubCategoryPayload) =>
      api.post<{ data: SubCategory }>("/master/sub-categories", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subCategories }),
  });
}

export function useUpdateSubCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: SubCategoryPayload & { id: number }) =>
      api.put<{ data: SubCategory }>(`/master/sub-categories/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subCategories }),
  });
}

export function useDeleteSubCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/sub-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subCategories }),
  });
}

export function useCreateMerk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MerkPayload) => api.post<{ data: Merk }>("/master/merks", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.merks }),
  });
}

export function useUpdateMerk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: MerkPayload & { id: number }) =>
      api.put<{ data: Merk }>(`/master/merks/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.merks }),
  });
}

export function useDeleteMerk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/merks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.merks }),
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UnitPayload) => api.post<{ data: Unit }>("/master/units", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.units }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UnitPayload & { id: number }) =>
      api.put<{ data: Unit }>(`/master/units/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.units }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/units/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.units }),
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WarehousePayload) =>
      api.post<{ data: Warehouse }>("/master/warehouses", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.warehouses }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: WarehousePayload & { id: number }) =>
      api.put<{ data: Warehouse }>(`/master/warehouses/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.warehouses }),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/warehouses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.warehouses }),
  });
}

export function useCreateRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RackPayload) => api.post<{ data: Rack }>("/master/racks", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.racks }),
  });
}

export function useUpdateRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: RackPayload & { id: number }) =>
      api.put<{ data: Rack }>(`/master/racks/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.racks }),
  });
}

export function useDeleteRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/racks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.racks }),
  });
}

export function useCreateBin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BinPayload) => api.post<{ data: Bin }>("/master/bins", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bins }),
  });
}

export function useUpdateBin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: BinPayload & { id: number }) =>
      api.put<{ data: Bin }>(`/master/bins/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bins }),
  });
}

export function useDeleteBin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/bins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bins }),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupplierPayload) =>
      api.post<{ data: Supplier }>("/master/suppliers", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suppliers }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: SupplierPayload & { id: number }) =>
      api.put<{ data: Supplier }>(`/master/suppliers/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suppliers }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/suppliers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suppliers }),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerPayload) =>
      api.post<{ data: Customer }>("/master/customers", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.customers }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: CustomerPayload & { id: number }) =>
      api.put<{ data: Customer }>(`/master/customers/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.customers }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.customers }),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendorPayload) => api.post<{ data: Vendor }>("/master/vendors", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.vendors }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: VendorPayload & { id: number }) =>
      api.put<{ data: Vendor }>(`/master/vendors/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.vendors }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/vendors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.vendors }),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ItemPayload) => api.post<{ data: ItemApi }>("/master/items", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.items }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: ItemPayload & { id: number }) =>
      api.put<{ data: ItemApi }>(`/master/items/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.items }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.items }),
  });
}

export function useBulkDeleteItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      api.post<{ message: string; deleted: number }>("/master/items/bulk-delete", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.items }),
  });
}

export function useBulkUpdateItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: "Aktif" | "Nonaktif" }) =>
      api.post<{ message: string; updated: number }>("/master/items/bulk-status", { ids, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.items }),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DepartmentPayload) =>
      api.post<{ data: Department }>("/master/departments", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.departments }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: DepartmentPayload & { id: number }) =>
      api.put<{ data: Department }>(`/master/departments/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.departments }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.departments }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectPayload) =>
      api.post<{ data: Project }>("/master/projects", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: ProjectPayload & { id: number }) =>
      api.put<{ data: Project }>(`/master/projects/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkOrderPayload) =>
      api.post<{ data: WorkOrder }>("/master/work-orders", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workOrders }),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: WorkOrderPayload & { id: number }) =>
      api.put<{ data: WorkOrder }>(`/master/work-orders/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workOrders }),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/work-orders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workOrders }),
  });
}

export type UserPayload = {
  code?: string;
  name: string;
  email: string;
  role: string;
  password?: string;
  is_active: boolean;
};

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UserPayload) => api.post<{ data: MasterUser }>("/master/users", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users });
      qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UserPayload & { id: number }) =>
      api.put<{ data: MasterUser }>(`/master/users/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users });
      qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/master/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users });
      qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}
