import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetchAll } from "@/lib/api";
import type { ProcDocApi, ProcDocPayload } from "@/lib/pengadaan-types";

// Backend membatasi `per_page` maks 100 — daftar PR diambil via fetchAll()
// (loop halaman 100) agar filter client-side tetap truthful.
export function useProcDocs() {
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "list"],
    queryFn: () => fetchAll<ProcDocApi>("/pengadaan/proc-docs", { kind: "PR" }),
    enabled: typeof window !== "undefined",
  });
}

export function useProcDoc(id: number | undefined) {
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "detail", id],
    queryFn: () => api.get<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}`),
    enabled: id != null && typeof window !== "undefined",
  });
}

export function useCreateProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProcDocPayload) =>
      api.post<{ data: ProcDocApi }>("/pengadaan/proc-docs", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useUpdateProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProcDocPayload }) =>
      api.put<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useDeleteProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ message: string }>(`/pengadaan/proc-docs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useSubmitProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useApproveProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useRejectProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/reject`, {
        decision_note: reason,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useCancelProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}

export function useReassignProcDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverUserId }: { id: number; approverUserId: number }) =>
      api.post<{ data: ProcDocApi }>(`/pengadaan/proc-docs/${id}/reassign`, {
        approver_user_id: approverUserId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengadaan"] }),
  });
}
