import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { LaporanMutasiParams, LaporanMutasiRowApi } from "@/lib/persediaan-types";

export function useLaporanMutasi(params: LaporanMutasiParams & { enabled?: boolean }) {
  const { from, to, warehouseId, categoryId, search, perPage, page, enabled = true } = params;
  return useQuery({
    queryKey: ["laporan", "mutasi", from, to, warehouseId ?? null, categoryId ?? null, search ?? null, perPage ?? null, page ?? null],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const sp = new URLSearchParams({ from, to });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (categoryId != null) sp.set("category_id", String(categoryId));
      if (search) sp.set("search", search);
      if (perPage != null) sp.set("per_page", String(perPage));
      if (page != null) sp.set("page", String(page));
      return api.get<Paginated<LaporanMutasiRowApi>>(`/laporan/mutasi?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}
