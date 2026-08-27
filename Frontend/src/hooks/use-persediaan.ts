import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type {
  StockCardApi,
  StockDocumentApi,
  StockDocumentPayload,
  StockDocumentSummaryApi,
  StockMinimumApi,
  StockRowApi,
  StockValuationApi,
  UpdateStockDocumentPayload,
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

export function useStockCard(
  itemId: number | undefined,
  method: ValuationMethod,
  warehouseId?: number | null,
  from?: string | null,
  to?: string | null,
) {
  return useQuery({
    queryKey: [
      "persediaan",
      "stock-card",
      itemId,
      method,
      warehouseId ?? null,
      from ?? null,
      to ?? null,
    ],
    queryFn: () => {
      const sp = new URLSearchParams({
        item_id: String(itemId),
        method,
      });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      return api.get<{ data: StockCardApi }>(`/persediaan/stock-card?${sp.toString()}`);
    },
    enabled: itemId != null && typeof window !== "undefined",
  });
}

export function useStockDocuments(
  params: {
    type?: string;
    status?: string;
    perPage?: number;
    warehouseId?: number | null;
    search?: string | null;
    from?: string | null;
    to?: string | null;
    enabled?: boolean;
  } = {},
) {
  const { type, status, perPage, warehouseId, search, from, to, enabled = true } = params;
  return useQuery({
    queryKey: [
      "persediaan",
      "stock-documents",
      "list",
      type ?? null,
      status ?? null,
      warehouseId ?? null,
      search ?? null,
      from ?? null,
      to ?? null,
      perPage ?? null,
    ],
    // Data lama tetap tampil saat ganti scope (filter/pagination) sampai data baru tiba —
    // pola resmi TanStack Query v5 (placeholderData: keepPreviousData).
    placeholderData: keepPreviousData,
    queryFn: () => {
      const sp = new URLSearchParams({ per_page: String(perPage ?? DOCS_PER_PAGE) });
      if (type) sp.set("type", type);
      if (status) sp.set("status", status);
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (search) sp.set("search", search);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      return api.get<Paginated<StockDocumentApi>>(`/persediaan/stock-documents?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}

export function useStockDocumentSummary() {
  return useQuery({
    queryKey: ["persediaan", "stock-documents", "summary"],
    queryFn: () =>
      api.get<{ data: StockDocumentSummaryApi }>("/persediaan/stock-documents/summary"),
    enabled: typeof window !== "undefined",
  });
}

export function useStockDocument(id: number | undefined) {
  return useQuery({
    queryKey: ["persediaan", "stock-documents", "detail", id],
    queryFn: () => api.get<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}`),
    enabled: id != null && typeof window !== "undefined",
  });
}

export function useCreateStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StockDocumentPayload) =>
      api.post<{ data: StockDocumentApi }>("/persediaan/stock-documents", payload),
    // Posting menggerakkan stok: invalidasi seluruh cache persediaan
    // (stock-documents, stock, stock-card, stock-minimum, valuation).
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useUpdateStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateStockDocumentPayload }) =>
      api.put<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function usePostStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/post`, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useCancelStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/cancel`, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useSubmitStockDocumentApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/submit-approval`, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useApproveStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision_note }: { id: number; decision_note?: string }) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/approve`, decision_note ? { decision_note } : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useRejectStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision_note }: { id: number; decision_note?: string }) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/reject`, { decision_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
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

export function useStockValuation(
  params: {
    warehouseId?: number | null;
    categoryId?: number | null;
    search?: string | null;
  } = {},
) {
  const { warehouseId, categoryId, search } = params;
  return useQuery({
    queryKey: ["persediaan", "valuation", warehouseId ?? null, categoryId ?? null, search ?? null],
    queryFn: () => {
      const sp = new URLSearchParams({ per_page: String(PER_PAGE) });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (categoryId != null) sp.set("category_id", String(categoryId));
      if (search) sp.set("search", search);
      return api.get<Paginated<StockValuationApi>>(`/persediaan/valuation?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined",
  });
}
