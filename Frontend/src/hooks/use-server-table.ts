import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";

/** Filter nilai server: string/number; null/undefined/"" dihilangkan. */
export type ServerTableFilters = Record<string, string | number | null | undefined>;

export type ServerTableParams = {
  page?: number;
  perPage?: number;
  search?: string | null;
  filters?: ServerTableFilters;
  enabled?: boolean;
};

/** Bangun query string tabel server (?page=&per_page=&search=&...). Pure — di-spec. */
export function buildTableQuery(params: {
  page: number;
  perPage: number;
  search?: string | null | undefined;
  filters?: ServerTableFilters;
}): string {
  const sp = new URLSearchParams({
    page: String(params.page),
    per_page: String(params.perPage),
  });
  if (params.search) sp.set("search", params.search);
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value == null || value === "") continue;
    sp.set(key, String(value));
  }
  return sp.toString();
}

/**
 * Hook tabel server-paginated generik (Fase 4).
 *
 * PENTING: `keyPrefix` WAJIB hidup di bawah prefix invalidasi modul
 * (mis. `[...keys.items]` dari use-master, atau `["persediaan", ...]`)
 * agar mutasi yang invalidate prefix modul tetap me-refresh tabel ini.
 * Jangan memakai prefix bebas seperti `["server-table"]` (K1).
 */
export function useServerTable<T>(
  keyPrefix: readonly unknown[],
  path: string,
  params: ServerTableParams = {},
) {
  const { page = 1, perPage = 12, search, filters = {}, enabled = true } = params;
  const query = useQuery({
    queryKey: [...keyPrefix, "table", page, perPage, search ?? null, filters],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<Paginated<T>>(`${path}?${buildTableQuery({ page, perPage, search, filters })}`),
    enabled: typeof window !== "undefined" && enabled,
  });
  return {
    ...query,
    rows: query.data?.data ?? [],
    total: query.data?.meta?.total ?? 0,
    lastPage: query.data?.meta?.last_page ?? 1,
  };
}
