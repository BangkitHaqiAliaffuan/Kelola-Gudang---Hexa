import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { ProcDocApi, ProcDocPayload } from "@/lib/pengadaan-types";

// Dokumen PR hanya ~60-an, ambil semua agar filter status/departemen/gudang
// client-side tetap benar (pola master-data).
const PER_PAGE = 500;

export function useProcDocs() {
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "list"],
    queryFn: () =>
      api.get<Paginated<ProcDocApi>>(`/pengadaan/proc-docs?kind=PR&per_page=${PER_PAGE}`),
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
