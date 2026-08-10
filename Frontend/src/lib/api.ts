const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api";

// Sanctum SPA: the CSRF cookie endpoint lives on the app origin (not under /api).
const CSRF_URL = `${API_BASE.replace(/\/api$/, "")}/sanctum/csrf-cookie`;

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

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  // ngrok free-tier intercepts browser requests with an HTML interstitial unless this header is set (see dev.sh).
  if (API_BASE !== "/api") headers["ngrok-skip-browser-warning"] = "true";

  // Sanctum SPA: every state-changing request needs the XSRF token (from the XSRF-TOKEN cookie).
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const xsrf = readCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(
      0,
      "Tidak dapat terhubung ke server backend. Pastikan Laravel berjalan (composer dev).",
    );
  }

  // 419 = CSRF token mismatch (e.g. token expired). Refresh the cookie once and retry.
  if (res.status === 419 && method !== "GET" && method !== "HEAD") {
    await fetchCsrfCookie();
    const xsrf = readCookie("XSRF-TOKEN");
    if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
    } catch {
      throw new ApiError(
        0,
        "Tidak dapat terhubung ke server backend. Pastikan Laravel berjalan (composer dev).",
      );
    }
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
    throw new ApiError(res.status, message, errors);
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

/** Pick the first validation message for a field from an ApiError, if any. */
export function fieldError(err: unknown, field: string): string | undefined {
  if (err instanceof ApiError) return err.errors?.[field]?.[0];
  return undefined;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Read a browser cookie, URL-decoding the value (Laravel encodes the XSRF token). */
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

/** Fetch the Sanctum CSRF cookie so the next state-changing request carries a fresh X-XSRF-TOKEN. */
export async function fetchCsrfCookie(): Promise<void> {
  if (typeof document === "undefined") return;
  await fetch(CSRF_URL, { credentials: "include", headers: { Accept: "application/json" } });
}
