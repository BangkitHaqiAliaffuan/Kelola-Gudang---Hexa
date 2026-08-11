import { api } from "./api";
import type { RoleAccessEntry } from "./schemas";

export type AuthUser = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  user: AuthUser;
  access: RoleAccessEntry[];
};

type AuthResponse = {
  data: AuthUser;
  access: RoleAccessEntry[];
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
