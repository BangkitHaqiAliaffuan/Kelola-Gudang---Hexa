import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { clearAuthToken, formatQueryError, isApiError } from "@/lib/api";

// Toast global untuk query gagal (Fase error-visibility): mutasi TIDAK ikut —
// mereka sudah punya toast lokal di tiap form (127 call-site), toast ganda dilarang.
// Dedupe 60 dtk per queryKey agar refetch latar tidak membanjiri toast.
const lastToastedAt = new Map<string, number>();
const TOAST_DEDUP_MS = 60_000;

function notifyQueryError(err: unknown, queryKey: unknown): void {
  if (typeof window === "undefined") return;
  const key = JSON.stringify(queryKey ?? "unknown");
  const now = Date.now();
  if (now - (lastToastedAt.get(key) ?? 0) < TOAST_DEDUP_MS) return;
  lastToastedAt.set(key, now);

  // Sesi mati di tengah jalan: buang token + kembali ke login (gate mengurus sisanya).
  if (isApiError(err) && err.status === 401 && window.location.pathname !== "/login") {
    clearAuthToken();
    toast.error("Sesi berakhir. Silakan login kembali.");
    window.location.assign("/login");
    return;
  }

  const { title, detail } = formatQueryError(err);
  toast.error(title, detail ? { description: detail } : undefined);
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => notifyQueryError(err, query.queryKey),
    }),
    defaultOptions: {
      queries: { retry: 1 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
