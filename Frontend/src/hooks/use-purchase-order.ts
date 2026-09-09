import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetchAll } from "@/lib/api";
import type { ProcDocApi, ProcDocPayload } from "@/lib/purchase-order-types";

export function useProcDocsPo(kind: "PO", params: { status?: string; enabled?: boolean } = {}) {
  const { status, enabled = true } = params;
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "list", kind, status ?? null],
    queryFn: () => {
      const p: Record<string, string> = { kind };
      if (status) p["status"] = status;
      return fetchAll<ProcDocApi>("/pengadaan/proc-docs", p);
    },
    enabled: enabled && typeof window !== "undefined",
  });
}

export function useProcDocPo(id: number | undefined) {
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "detail", id],
    queryFn: () => api.get<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}`),
    enabled: id != null && typeof window !== "undefined",
  });
}

export function useApprovedProcDocsPr() {
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "list", "PR", "Disetujui"],
    queryFn: () =>
      fetchAll<ProcDocApi>("/pengadaan/proc-docs", { kind: "PR", status: "Disetujui" }),
    enabled: typeof window !== "undefined",
  });
}

export function useCreateProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProcDocPayload) =>
      api.post<{ data: ProcDocApi }>("/pengadaan/proc-docs", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useUpdateProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProcDocPayload }) =>
      api.put<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useDeleteProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/pengadaan/proc-docs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useSubmitProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useApproveProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useRejectProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision_note }: { id: number; decision_note: string }) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/reject`, { decision_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}

export function useCancelProcDocPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan", "proc-docs"] }),
  });
}
