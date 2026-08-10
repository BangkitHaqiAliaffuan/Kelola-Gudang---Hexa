import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { authApi, type AuthSession } from "@/lib/auth-api";
import { fetchCsrfCookie, isApiError } from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Client-side marker that the user has logged in on this browser. */
const AUTH_STORAGE_KEY = "kg-auth";

type StoredUser = {
  email: string | null;
  name: string;
  role: string;
};

function readStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: { email: string | null; name: string; role: string }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ email: user.email, name: user.name, role: user.role } satisfies StoredUser),
  );
}

function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

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

    // No localStorage login marker → no session in this browser; go straight to login.
    if (!readStoredUser()) {
      setStatus("unauthenticated");
      return;
    }

    (async () => {
      try {
        await fetchCsrfCookie();
        const me = await authApi.me();
        if (!cancelled) {
          setSession({ user: me.data, access: me.access });
          setStatus("authenticated");
        }
      } catch (err) {
        if (!cancelled) {
          // Session really invalid (401) → drop the marker so next visit lands on login.
          if (isApiError(err) && err.status === 401) clearStoredUser();
          setStatus("unauthenticated");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    await fetchCsrfCookie();
    const next = await authApi.login(email, password);
    writeStoredUser(next.data);
    setSession({ user: next.data, access: next.access });
    setStatus("authenticated");
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearStoredUser();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
