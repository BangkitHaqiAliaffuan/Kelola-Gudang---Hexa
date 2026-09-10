import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";

export type AuditLogApi = {
  id: number;
  occurred_at: string | null;
  user_id: number | null;
  user_name: string | null;
  role: string | null;
  action: string;
  module: string | null;
  auditable: string | null;
  auditable_id: number | null;
  record_no: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
};

export const AUDIT_ACTIONS = [
  "Login",
  "Logout",
  "Create",
  "Update",
  "Delete",
  "Post",
  "Cancel",
  "Submit",
  "Approve",
  "Reject",
  "Reassign",
  "Export",
] as const;

export function useAuditLogs(params: {
  action?: string | null;
  module?: string | null;
  userId?: number | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  perPage?: number | null;
  page?: number | null;
  enabled?: boolean;
}) {
  const { action, module, userId, from, to, search, perPage, page, enabled = true } = params;
  return useQuery({
    queryKey: [
      "system",
      "audit-logs",
      action ?? null,
      module ?? null,
      userId ?? null,
      from ?? null,
      to ?? null,
      search ?? null,
      perPage ?? null,
      page ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (action) sp.set("action", action);
      if (module) sp.set("module", module);
      if (userId != null) sp.set("user_id", String(userId));
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (search) sp.set("search", search);
      if (perPage != null) sp.set("per_page", String(perPage));
      if (page != null) sp.set("page", String(page));
      return api.get<Paginated<AuditLogApi>>(`/system/audit-logs?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}
