import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { authApi, type AuthSession } from "@/lib/auth-api";
import { clearAuthToken, getAuthToken, isApiError, setAuthToken } from "@/lib/api";
import type { AccessLevel } from "@/lib/schemas";

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True when the module exists in the session's access map (or while still loading). */
  hasModule: (module: string) => boolean;
  /** True when the module exists AND its level ranks >= the required level. */
  hasModuleLevel: (module: string, minLevel: AccessLevel) => boolean;
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
          setSession({ user: me.data, access: me.access });
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
    setSession({ user: next.data, access: next.access });
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      access: session?.access ?? [],
      login,
      logout,
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
