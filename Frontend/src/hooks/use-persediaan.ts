import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetchAll, type Paginated } from "@/lib/api";
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

// Backend membatasi `per_page` maks 100 (Fase 1.2 skalabilitas): daftar yang
// butuh seluruh baris diambil via fetchAll() (loop halaman 100). Valuasi
// tetap request tunggal per_page=500 (batas endpoint agregat, K6).
const PER_PAGE = 500;
// Stock documents are seeded in the thousands — fetch them all so
// the client-side type/status/warehouse filters stay truthful.

export function useStockRows() {
  return useQuery({
    queryKey: ["persediaan", "stock"],
    queryFn: () => fetchAll<StockRowApi>("/persediaan/stock"),
    enabled: typeof window !== "undefined",
  });
}

// Lokasi stock satu barang: satu baris per (gudang, bin) langsung dari
// `item_stock` (kolom stock/reserved selalu mutakhir per posting terakhir —
// tabel ini tidak punya timestamp, jadi kesegaran dijamin via refetch).
export function useStockLocations(itemId: number | undefined) {
  return useQuery({
    queryKey: ["persediaan", "stock", { item: itemId ?? null }],
    queryFn: () => fetchAll<StockRowApi>("/persediaan/stock", { item_id: String(itemId) }),
    enabled: itemId != null && typeof window !== "undefined",
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
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
      const params: Record<string, string> = {};
      if (type) params["type"] = type;
      if (status) params["status"] = status;
      if (warehouseId != null) params["warehouse_id"] = String(warehouseId);
      if (search) params["search"] = search;
      if (from) params["from"] = from;
      if (to) params["to"] = to;
      // Pemanggil dengan perPage eksplisit (mis. form retur, perPage=20) tetap
      // request tunggal; tanpa perPage → fetchAll agar filter client truthful.
      if (perPage != null) {
        const sp = new URLSearchParams({ ...params, per_page: String(perPage) });
        return api.get<Paginated<StockDocumentApi>>(`/persediaan/stock-documents?${sp.toString()}`);
      }
      return fetchAll<StockDocumentApi>("/persediaan/stock-documents", params);
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
    staleTime: 30_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
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
    onMutate: async ({ id, payload }) => {
      const detailKey = ["persediaan", "stock-documents", "detail", id];
      await qc.cancelQueries({ queryKey: detailKey });

      const prev = qc.getQueryData<{ data: StockDocumentApi }>(detailKey);
      if (prev?.data?.lines) {
        // Optimistic patch ke detail state
        qc.setQueryData(detailKey, (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: {
              ...old.data,
              lines: old.data.lines.map((l: any) => {
                const pl = payload.lines.find(
                  (p) => p.item_id === l.item_id && p.from_bin_id === l.from_bin_id,
                );
                return pl ? { ...l, actual_qty: pl.actual_qty } : l;
              }),
            },
          };
        });
      }
      return { prev, detailKey };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.detailKey, ctx.prev); // Rollback
    },
    onSuccess: (data) => {
      const detailKey = ["persediaan", "stock-documents", "detail", data.data.id];
      qc.setQueryData(detailKey, data);
    },
    onSettled: (data, err, vars) => {
      qc.invalidateQueries({ queryKey: ["persediaan", "stock-documents", "list"] });
      qc.invalidateQueries({ queryKey: ["persediaan", "stock-documents", "summary"] });
      // Invalidate detail juga agar tab lain dapat refetch saat mount, tapi
      // refetchOnWindowFocus tetap false untuk cegah kedipan saat fokus
      if (data?.data?.id) {
        qc.invalidateQueries({
          queryKey: ["persediaan", "stock-documents", "detail", data.data.id],
        });
      } else if (vars?.id) {
        qc.invalidateQueries({ queryKey: ["persediaan", "stock-documents", "detail", vars.id] });
      }
    },
  });
}

export function useLockStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/lock`, null),
    onSuccess: (data) => {
      qc.setQueryData(["persediaan", "stock-documents", "detail", data.data.id], data);
      qc.invalidateQueries({ queryKey: ["persediaan", "stock-documents", "list"] });
    },
  });
}

export function useHeartbeatStockDocument() {
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/heartbeat`, null),
  });
}

export function useUnlockStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/unlock`, null),
    onSuccess: (data) => {
      qc.setQueryData(["persediaan", "stock-documents", "detail", data.data.id], data);
    },
  });
}

export function useForceUnlockStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.post<{ data: StockDocumentApi }>(
        `/persediaan/stock-documents/${id}/force-unlock`,
        reason ? { reason } : null,
      ),
    onSuccess: (data) => {
      qc.setQueryData(["persediaan", "stock-documents", "detail", data.data.id], data);
      qc.invalidateQueries({ queryKey: ["persediaan", "stock-documents", "list"] });
    },
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
      api.post<{ data: StockDocumentApi }>(
        `/persediaan/stock-documents/${id}/submit-approval`,
        null,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useApproveStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision_note }: { id: number; decision_note?: string }) =>
      api.post<{ data: StockDocumentApi }>(
        `/persediaan/stock-documents/${id}/approve`,
        decision_note ? { decision_note } : null,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["persediaan"] }),
  });
}

export function useRejectStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision_note }: { id: number; decision_note?: string }) =>
      api.post<{ data: StockDocumentApi }>(`/persediaan/stock-documents/${id}/reject`, {
        decision_note,
      }),
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
      const params: Record<string, string> = {};
      if (days) params["days"] = String(days);
      if (warehouseId != null) params["warehouse_id"] = String(warehouseId);
      if (categoryId != null) params["category_id"] = String(categoryId);
      return fetchAll<StockMinimumApi>("/persediaan/stock-minimum", params);
    },
    enabled: typeof window !== "undefined",
  });
}

export function useStockValuation(
  params: {
    warehouseId?: number | null;
    categoryId?: number | null;
    search?: string | null;
    moving?: string | null;
  } = {},
) {
  const { warehouseId, categoryId, search, moving } = params;
  return useQuery({
    queryKey: [
      "persediaan",
      "valuation",
      warehouseId ?? null,
      categoryId ?? null,
      search ?? null,
      moving ?? null,
    ],
    queryFn: () => {
      const sp = new URLSearchParams({ per_page: String(PER_PAGE) });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (categoryId != null) sp.set("category_id", String(categoryId));
      if (search) sp.set("search", search);
      // Filter server-side (didukung backend setelah param `moving` mendarat di
      // StockController::valuation; sebelum itu diabaikan backend dan filter
      // client-side di bawah yang menentukan).
      if (moving) sp.set("moving", moving);
      return api.get<Paginated<StockValuationApi>>(`/persediaan/valuation?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined",
  });
}
