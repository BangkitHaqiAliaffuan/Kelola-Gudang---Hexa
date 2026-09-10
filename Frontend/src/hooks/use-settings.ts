import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type CompanySettings = Record<string, string>;

export function useCompanySettings(enabled = true) {
  return useQuery({
    queryKey: ["system", "settings"],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ key: string; value: string | null }> }>(
        "/system/settings",
      );
      return Object.fromEntries(res.data.map((r) => [r.key, r.value ?? ""])) as CompanySettings;
    },
    enabled: typeof window !== "undefined" && enabled,
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (company: Record<string, string | null>) =>
      api.put<{ message: string }>("/system/settings", { company }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system", "settings"] }),
  });
}

const escHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Baris kop perusahaan untuk template cetak (window.print). */
export function companyKopHtml(company: CompanySettings | undefined): string {
  const name = company?.["company.name"]?.trim() || "KelolaGudang Pro";
  const meta = [company?.["company.address"]?.trim(), company?.["company.phone"]?.trim()]
    .filter(Boolean)
    .join(" · ");
  return `<p class="mono muted">${escHtml(name)}${meta ? ` · ${escHtml(meta)}` : ""}</p>`;
}
