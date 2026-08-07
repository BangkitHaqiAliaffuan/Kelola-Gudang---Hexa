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

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  // ngrok free-tier intercepts browser requests with an HTML interstitial unless this header is set (see dev.sh).
  if (API_BASE !== "/api") headers["ngrok-skip-browser-warning"] = "true";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "Tidak dapat terhubung ke server backend. Pastikan Laravel berjalan (composer dev).",
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
