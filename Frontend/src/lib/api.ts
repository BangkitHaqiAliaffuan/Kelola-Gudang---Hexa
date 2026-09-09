const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api";

export type Paginated<T> = {
  data: T[];
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]> | undefined;
  readonly path: string;
  readonly method: string;

  constructor(
    status: number,
    message: string,
    path = "",
    method = "GET",
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.method = method;
    this.errors = errors;
  }
}

/** Bearer token for the Sanctum API (issued on login, stored in localStorage). */
const TOKEN_STORAGE_KEY = "kg-token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  // ngrok free-tier intercepts browser requests with an HTML interstitial unless this header is set (see dev.sh).
  // Send always — even same-origin calls travel through the Vercel rewrite and must reach ngrok intact.
  headers["ngrok-skip-browser-warning"] = "true";

  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "Tidak dapat terhubung ke server backend. Pastikan Laravel berjalan (composer dev).",
      path,
      method,
    );
  }

  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    let errors: Record<string, string[]> | undefined;
    try {
      const body = (await res.json()) as { message?: string; errors?: Record<string, string[]> };
      if (body.message) message = body.message;
      errors = body.errors;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw new ApiError(res.status, message, path, method, errors);
  }

  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Fetch-all paginasi server (Fase 1.2 skalabilitas): meminta halaman
 * `per_page=100` berulang mengikuti `meta.last_page` lalu menggabung `data`.
 * Batas backend `max:100` membuat request tunggal raksasa ditolak 422 —
 * gunakan ini untuk daftar yang memang butuh seluruh baris di client
 * (filter/paginasi client-side). Bukan untuk laporan agregat (tetap
 * server-driven). Ada pengaman jumlah halaman agar loop tidak liar.
 */
const FETCH_ALL_PER_PAGE = 100;
const FETCH_ALL_MAX_PAGES = 500;

export async function fetchAll<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<Paginated<T>> {
  const all: T[] = [];
  let last: Paginated<T> | null = null;
  let page = 1;
  for (;;) {
    const sp = new URLSearchParams({
      ...params,
      per_page: String(FETCH_ALL_PER_PAGE),
      page: String(page),
    });
    const sep = path.includes("?") ? "&" : "?";
    const res = await request<Paginated<T>>(`${path}${sep}${sp.toString()}`);
    all.push(...res.data);
    last = res;
    const lastPage = res.meta?.last_page ?? page;
    if (page >= lastPage || page >= FETCH_ALL_MAX_PAGES) break;
    page += 1;
  }
  const out: Paginated<T> = { data: all };
  if (last?.links !== undefined) out.links = last.links;
  if (last?.meta !== undefined) {
    out.meta = {
      ...last.meta,
      current_page: 1,
      last_page: 1,
      per_page: all.length,
      from: all.length > 0 ? 1 : null,
      to: all.length > 0 ? all.length : null,
    };
  }
  return out;
}

/** Pick the first validation message for a field from an ApiError, if any. */
export function fieldError(err: unknown, field: string): string | undefined {
  if (err instanceof ApiError) return err.errors?.[field]?.[0];
  return undefined;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

const IS_DEV = (import.meta.env["DEV"] as boolean | undefined) ?? false;

/** Judul ramah-pengguna untuk error query. Endpoint hanya diungkap di DEV. */
export function formatQueryError(err: unknown): { title: string; detail: string } {
  if (!isApiError(err)) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    return {
      title: message,
      detail: IS_DEV ? "Non-API error (lihat console)" : "",
    };
  }
  let title = err.message;
  if (err.status === 0) title = "Tidak dapat terhubung ke server backend";
  else if (err.status === 401) title = "Sesi berakhir. Silakan login kembali.";
  else if (err.status === 403) title = "Akses ditolak untuk peran Anda.";
  else if (err.status === 404) title = "Data tidak ditemukan di server.";
  else if (err.status === 429) title = "Terlalu banyak permintaan. Coba lagi sesaat lagi.";
  else if (err.status >= 500) title = "Server backend bermasalah. Coba lagi sesaat lagi.";
  const detail = IS_DEV && err.path ? `${err.method} ${err.path} → ${err.status}` : "";
  return { title, detail };
}
