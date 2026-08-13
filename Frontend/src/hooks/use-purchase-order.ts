import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Paginated } from "@/lib/api";
import type { ProcDocApi, ProcDocPayload } from "@/lib/purchase-order-types";

const DOCS_PER_PAGE = 10000;

export function useProcDocsPo(kind: "PO", params: { status?: string } = {}) {
  const { status } = params;
  return useQuery({
    queryKey: ["pengadaan", "proc-docs", "list", kind, status ?? null],
    queryFn: () => {
      const sp = new URLSearchParams({ kind, per_page: String(DOCS_PER_PAGE) });
      if (status) sp.set("status", status);
      return api.get<Paginated<ProcDocApi>>(`/pengadaan/proc-docs?${sp.toString()}`);
    },
    enabled: typeof window !== "undefined",
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
      api.get<Paginated<ProcDocApi>>(
        `/pengadaan/proc-docs?kind=PR&status=Disetujui&per_page=${DOCS_PER_PAGE}`,
      ),
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
