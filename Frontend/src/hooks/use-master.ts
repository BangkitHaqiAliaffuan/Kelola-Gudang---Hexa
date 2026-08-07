import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { Category, ItemApi, Merk, SubCategory } from "@/lib/master-types";

// Data volume is small (~300 items), so fetch everything and let the UI
// (DataTable) paginate + filter client-side, matching the existing UX.
const PER_PAGE = 500;

const keys = {
  categories: ["master", "categories"] as const,
  subCategories: ["master", "sub-categories"] as const,
  merks: ["master", "merks"] as const,
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

export function useItems() {
  return useQuery({
    queryKey: keys.items,
    queryFn: () => api.get<Paginated<ItemApi>>(`/master/items?per_page=${PER_PAGE}`),
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
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
};

export type SubCategoryPayload = {
  category_id: number;
  code: string;
  name: string;
  is_active: boolean;
};

export type MerkPayload = {
  code: string;
  name: string;
  country?: string;
  is_active: boolean;
};

export type ItemPayload = {
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number;
  sub_category_id?: number;
  brand_id?: number;
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
