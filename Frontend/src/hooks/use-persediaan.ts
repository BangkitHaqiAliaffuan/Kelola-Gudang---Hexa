import { useQuery } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type {
  StockCardApi,
  StockDocumentApi,
  StockMinimumApi,
  StockRowApi,
  ValuationMethod,
} from "@/lib/persediaan-types";

// Data volume is small (~300 rows), so fetch everything and let the UI
// (DataTable) paginate + filter client-side, matching the master-data pattern.
const PER_PAGE = 500;
// Stock documents are seeded in the thousands (~4.6k today) — fetch them all so
// the client-side type/status/warehouse filters stay truthful.
const DOCS_PER_PAGE = 10000;

export function useStockRows() {
  return useQuery({
    queryKey: ["persediaan", "stock"],
    queryFn: () => api.get<Paginated<StockRowApi>>(`/persediaan/stock?per_page=${PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useStockCard(itemId: number | undefined, method: ValuationMethod) {
  return useQuery({
    queryKey: ["persediaan", "stock-card", itemId, method],
    queryFn: () =>
      api.get<{ data: StockCardApi }>(
        `/persediaan/stock-card?item_id=${itemId}&method=${encodeURIComponent(method)}`,
      ),
    enabled: itemId != null && typeof window !== "undefined",
  });
}

export function useStockDocuments() {
  return useQuery({
    queryKey: ["persediaan", "stock-documents"],
    queryFn: () =>
      api.get<Paginated<StockDocumentApi>>(`/persediaan/stock-documents?per_page=${DOCS_PER_PAGE}`),
    enabled: typeof window !== "undefined",
  });
}

export function useStockDocument(id: number | undefined) {
  return useQuery({
    queryKey: ["persediaan", "stock-documents", id],
    queryFn: () => api.get<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}`),
    enabled: id != null && typeof window !== "undefined",
  });
}

export function useStockMinimum(
  params: {
    days?: number;
    warehouseId?: number | null;
    categoryId?: number | null;
  } = {},
) {
  const { days, warehouseId, categoryId } = params;
  return useQuery({
    queryKey: ["persediaan", "stock-minimum", days, warehouseId ?? null, categoryId ?? null],
    queryFn: () => {
      const sp = new URLSearchParams({ per_page: String(PER_PAGE) });
      if (days) sp.set("days", String(days));
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (categoryId != null) sp.set("category_id", String(categoryId));
      return api.get<Paginated<StockMinimumApi>>(`/persediaan/stock-minimum?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined",
  });
}
