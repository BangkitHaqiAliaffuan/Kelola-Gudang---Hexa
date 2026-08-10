import { useQuery } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { StockCardApi, StockRowApi, ValuationMethod } from "@/lib/persediaan-types";

// Data volume is small (~300 rows), so fetch everything and let the UI
// (DataTable) paginate + filter client-side, matching the master-data pattern.
const PER_PAGE = 500;

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
