import { api } from "./api";
import type { RoleAccessEntry } from "./schemas";

export type AuthUser = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  role: string;
  default_warehouse_id: number | null;
  warehouse: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  user: AuthUser;
  access: RoleAccessEntry[];
  /** Hak review dokumen persediaan (flag `can_review` dari tabel roles). */
  can_review: boolean;
  /** Lingkup gudang user (F7): mode + id gudang izin (null = Semua). */
  warehouse_scope: WarehouseScope;
};

export type WarehouseScope = {
  /** 'Semua' = lintas-gudang; 'Terbatas' = hanya `ids`. */
  mode: string;
  ids: number[] | null;
};

const SCOPE_SEMUA: WarehouseScope = { mode: "Semua", ids: null };

/** Normalisasi payload scope (backend lama / nilai asing → Semua). */
export function normalizeScope(raw: unknown): WarehouseScope {
  if (typeof raw !== "object" || raw === null) return SCOPE_SEMUA;
  const r = raw as { mode?: unknown; ids?: unknown };
  if (r.mode !== "Terbatas") return SCOPE_SEMUA;
  const ids = Array.isArray(r.ids)
    ? r.ids.filter((v): v is number => typeof v === "number" && Number.isInteger(v))
    : [];
  return { mode: "Terbatas", ids };
}

type AuthResponse = {
  data: AuthUser;
  access: RoleAccessEntry[];
  can_review: boolean;
  warehouse_scope?: unknown;
};

type LoginResponse = AuthResponse & {
  token: string;
};

export const authApi = {
  me: () => api.get<AuthResponse>("/auth/me"),
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }),
  logout: () => api.post<{ message: string }>("/auth/logout", {}),
};
