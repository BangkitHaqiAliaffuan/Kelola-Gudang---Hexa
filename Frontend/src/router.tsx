import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { clearAuthToken, formatQueryError, isApiError } from "@/lib/api";
import { requestResync } from "@/lib/session-sync";

// Toast global untuk query gagal (Fase error-visibility): mutasi TIDAK ikut —
// mereka sudah punya toast lokal di tiap form (127 call-site), toast ganda dilarang.
// Dedupe 60 dtk per queryKey agar refetch latar tidak membanjiri toast.
const lastToastedAt = new Map<string, number>();
const TOAST_DEDUP_MS = 60_000;

// Resync sesi per queryKey (maks sekali/60 dtk): 403 sering berarti peta access
// sesi basi (role diubah setelah login), bukan penolakan permanen.
const lastResyncedAt = new Map<string, number>();
const RESYNC_DEDUP_MS = 60_000;
// Toast 403 ditahan selama resync berjalan; batalkan bila peta akses berubah.
const RESYNC_WAIT_MS = 1_500;

function withTimeout(promise: Promise<boolean>, ms: number): Promise<boolean> {
  return Promise.race([
    promise,
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), ms);
    }),
  ]);
}

async function notifyQueryError(err: unknown, queryKey: unknown): Promise<void> {
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

  // 403: sinkronkan ulang sesi dulu — bila peta akses ternyata berubah (role
  // diedit setelah login), batalkan toast error dan beri tahu penyesuaian.
  // Bila map identik, jatuh ke toast error normal di bawah (penolakan legitim).
  if (isApiError(err) && err.status === 403) {
    const rkey = `resync:${key}`;
    if (now - (lastResyncedAt.get(rkey) ?? 0) >= RESYNC_DEDUP_MS) {
      lastResyncedAt.set(rkey, now);
      let changed = false;
      try {
        changed = await withTimeout(requestResync(), RESYNC_WAIT_MS);
      } catch {
        changed = false;
      }
      if (changed) {
        toast.info("Hak akses Anda diperbarui — tampilan disesuaikan.");
        return;
      }
    }
  }

  const { title, detail } = formatQueryError(err);
  toast.error(title, detail ? { description: detail } : undefined);
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        void notifyQueryError(err, query.queryKey);
      },
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
