import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, fetchAll, type Paginated } from "@/lib/api";
import type {
  FastMovingParams,
  FastMovingRowApi,
  KeluarAnalyticsApi,
  KeluarAnalyticsParams,
  LaporanMutasiParams,
  LaporanMutasiRowApi,
  TransaksiAnalyticsApi,
  TransaksiAnalyticsParams,
} from "@/lib/persediaan-types";

export function useLaporanMutasi(params: LaporanMutasiParams & { enabled?: boolean }) {
  const { from, to, warehouseId, categoryId, search, perPage, page, enabled = true } = params;
  return useQuery({
    queryKey: [
      "laporan",
      "mutasi",
      from,
      to,
      warehouseId ?? null,
      categoryId ?? null,
      search ?? null,
      perPage ?? null,
      page ?? null,
    ],
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

export function useLaporanKeluarAnalytics(params: KeluarAnalyticsParams & { enabled?: boolean }) {
  const {
    from,
    to,
    warehouseId,
    customerId,
    departmentId,
    projectId,
    jenisTujuan,
    atRiskDays,
    varianceBand,
    enabled = true,
  } = params;
  return useQuery({
    queryKey: [
      "laporan",
      "keluar-analytics",
      from,
      to,
      warehouseId ?? null,
      customerId ?? null,
      departmentId ?? null,
      projectId ?? null,
      jenisTujuan ?? null,
      atRiskDays ?? null,
      varianceBand ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const sp = new URLSearchParams({ from, to });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (customerId != null) sp.set("customer_id", String(customerId));
      if (departmentId != null) sp.set("department_id", String(departmentId));
      if (projectId != null) sp.set("project_id", String(projectId));
      if (jenisTujuan) sp.set("jenis_tujuan", jenisTujuan);
      if (atRiskDays != null) sp.set("at_risk_days", String(atRiskDays));
      if (varianceBand != null) sp.set("variance_band", String(varianceBand));
      return api.get<{ data: KeluarAnalyticsApi }>(`/laporan/keluar-analytics?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}

export function useTransaksiAnalytics(params: TransaksiAnalyticsParams & { enabled?: boolean }) {
  const {
    type,
    from,
    to,
    warehouseId,
    destinationWarehouseId,
    atRiskDays,
    enabled = true,
  } = params;
  return useQuery({
    queryKey: [
      "laporan",
      "transaksi-analytics",
      type,
      from,
      to,
      warehouseId ?? null,
      destinationWarehouseId ?? null,
      atRiskDays ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const sp = new URLSearchParams({ type, from, to });
      if (warehouseId != null) sp.set("warehouse_id", String(warehouseId));
      if (destinationWarehouseId != null)
        sp.set("destination_warehouse_id", String(destinationWarehouseId));
      if (atRiskDays != null) sp.set("at_risk_days", String(atRiskDays));
      return api.get<{ data: TransaksiAnalyticsApi }>(
        `/laporan/transaksi-analytics?${sp.toString()}`,
      );
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}

// ---- Fast Moving (GET /api/laporan/fast-moving) ----
// Backend mem-paginasi server-side (max per_page 500); rank hanya truthful bila
// seluruh baris ditarik — gunakan fetchAll() seperti hooks master (loop halaman
// 100) lalu urutkan client-side.
export function useLaporanFastMoving(params: FastMovingParams & { enabled?: boolean }) {
  const { from, to, warehouseId, categoryId, search, enabled = true } = params;
  return useQuery({
    queryKey: [
      "laporan",
      "fast-moving",
      from,
      to,
      warehouseId ?? null,
      categoryId ?? null,
      search ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p: Record<string, string> = {};
      if (warehouseId != null) p["warehouse_id"] = String(warehouseId);
      if (categoryId != null) p["category_id"] = String(categoryId);
      if (search) p["search"] = search;
      const sp = new URLSearchParams({ from, to });
      const suffix = sp.toString();
      return fetchAll<FastMovingRowApi>(`/laporan/fast-moving?${suffix}`, p);
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}
