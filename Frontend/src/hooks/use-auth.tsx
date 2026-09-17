import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { authApi, normalizeScope, type AuthSession } from "@/lib/auth-api";
import { clearAuthToken, getAuthToken, isApiError, setAuthToken } from "@/lib/api";
import { requestResync, setResyncHandler } from "@/lib/session-sync";
import type { AccessLevel, RoleAccessEntry } from "@/lib/schemas";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

const LEVEL_RANK: Record<AccessLevel, number> = { Baca: 1, Tulis: 2, Kelola: 3 };

/** Rank of an access level (Baca=1, Tulis=2, Kelola=3); unknown → 0. */
export function levelRank(level: string): number {
  return LEVEL_RANK[level as AccessLevel] ?? 0;
}

export function moduleLevel(access: AuthSession["access"], module: string): AccessLevel | null {
  const entry = access.find((a) => a.module === module || a.module === "Semua Modul");
  return entry ? entry.level : null;
}

type AuthContextValue = {
  status: AuthStatus;
  user: AuthSession["user"] | null;
  access: AuthSession["access"];
  /** Flag `can_review` role sendiri (pengganti cek nama role "Auditor"). */
  canReview: boolean;
  /** Lingkup gudang sesi (F7): mode + id gudang izin (null = Semua). */
  warehouseScope: AuthSession["warehouse_scope"];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True when the module exists in the session's access map (or while still loading). */
  hasModule: (module: string) => boolean;
  /** True when the module exists AND its level ranks >= the required level. */
  hasModuleLevel: (module: string, minLevel: AccessLevel) => boolean;
  /**
   * Refresh sesi via GET /auth/me (peta `access` adalah snapshot login/boot dan
   * bisa basi setelah role diubah). Resolve true bila peta akses berubah.
   * 401 → token dibuang + unauthenticated (jalur logout existing).
   */
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // No stored token → no session in this browser; go straight to login.
    if (!getAuthToken()) {
      setStatus("unauthenticated");
      return;
    }

    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) {
          setSession({
            user: me.data,
            access: me.access,
            can_review: me.can_review ?? false,
            warehouse_scope: normalizeScope(me.warehouse_scope),
          });
          setStatus("authenticated");
        }
      } catch (err) {
        if (!cancelled) {
          // Token really invalid (401) → drop it so next visit lands on login.
          if (isApiError(err) && err.status === 401) clearAuthToken();
          setStatus("unauthenticated");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const next = await authApi.login(email, password);
    setAuthToken(next.token);
    setSession({
      user: next.data,
      access: next.access,
      can_review: next.can_review ?? false,
      warehouse_scope: normalizeScope(next.warehouse_scope),
    });
    setStatus("authenticated");
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAuthToken();
      setSession(null);
      setStatus("unauthenticated");
    }
  };

  // Cermin sesi untuk handler resync (efek registrasi di bawah hanya jalan
  // sekali agar tidak re-subscribe tiap render).
  const sessionRef = useRef<AuthSession | null>(null);
  sessionRef.current = session;

  // Daftarkan refresh sesi ke jembatan session-sync agar QueryCache (di luar
  // tree React) bisa memicu resync saat query 403 — peta access sesi basi
  // setelah matriks role diubah.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let inFlight: Promise<boolean> | null = null;

    const sameAccess = (a: RoleAccessEntry[], b: RoleAccessEntry[]): boolean => {
      const key = (e: RoleAccessEntry): string => `${e.module}::${e.level}`;
      const sorted = (list: RoleAccessEntry[]): string[] =>
        list.map(key).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      const sa = sorted(a);
      const sb = sorted(b);
      return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
    };

    const sameScope = (
      a: AuthSession["warehouse_scope"] | undefined,
      b: AuthSession["warehouse_scope"],
    ): boolean => {
      const idsA = a?.ids ?? null;
      return (
        (a?.mode ?? "Semua") === b.mode &&
        (idsA === null || b.ids === null
          ? idsA === b.ids
          : idsA.length === b.ids.length && idsA.every((v, i) => v === b.ids![i]))
      );
    };

    const handler = (): Promise<boolean> => {
      if (inFlight) return inFlight;
      inFlight = (async (): Promise<boolean> => {
        try {
          if (!getAuthToken()) return false;
          const me = await authApi.me();
          if (cancelled) return false;
          const scope = normalizeScope(me.warehouse_scope);
          const changed =
            !sameAccess(sessionRef.current?.access ?? [], me.access) ||
            (sessionRef.current?.can_review ?? false) !== (me.can_review ?? false) ||
            !sameScope(sessionRef.current?.warehouse_scope, scope);
          setSession({
            user: me.data,
            access: me.access,
            can_review: me.can_review ?? false,
            warehouse_scope: scope,
          });
          setStatus("authenticated");
          return changed;
        } catch (err) {
          // Token benar-benar mati → buang agar pendaratan berikutnya ke login.
          if (!cancelled && isApiError(err) && err.status === 401) {
            clearAuthToken();
            setStatus("unauthenticated");
          }
          return false;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    };

    setResyncHandler(handler);
    return () => {
      cancelled = true;
      setResyncHandler(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      access: session?.access ?? [],
      canReview: session?.can_review ?? false,
      warehouseScope: session?.warehouse_scope ?? { mode: "Semua", ids: null },
      login,
      logout,
      refreshSession: () => requestResync(),
      hasModule: (module) =>
        status !== "authenticated" ||
        session!.access.some((a) => a.module === module || a.module === "Semua Modul"),
      hasModuleLevel: (module, minLevel) => {
        const level = status === "authenticated" ? moduleLevel(session!.access, module) : null;
        return level !== null && levelRank(level) >= LEVEL_RANK[minLevel];
      },
    }),
    [status, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
