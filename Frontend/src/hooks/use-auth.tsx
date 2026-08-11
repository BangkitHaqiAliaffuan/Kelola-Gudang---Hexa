import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { authApi, type AuthSession } from "@/lib/auth-api";
import { clearAuthToken, getAuthToken, isApiError, setAuthToken } from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthSession["user"] | null;
  access: AuthSession["access"];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True when the module exists in the session's access map (or while still loading). */
  hasModule: (module: string) => boolean;
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
