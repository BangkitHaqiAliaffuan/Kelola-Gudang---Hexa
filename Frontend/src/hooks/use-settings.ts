import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export type CompanySettings = Record<string, string>;

export function useCompanySettings(enabled = true) {
  // GET /system/settings digate role.access:System di backend — hanya tembak
  // bila sesi punya System Baca agar role tanpa akses tidak 403 + toast global
  // di setiap mount (dialog profil di header me-mount di semua halaman).
  const { hasModuleLevel } = useAuth();
  const canRead = hasModuleLevel("System", "Baca");
  return useQuery({
    queryKey: ["system", "settings"],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ key: string; value: string | null }> }>(
        "/system/settings",
      );
      return Object.fromEntries(res.data.map((r) => [r.key, r.value ?? ""])) as CompanySettings;
    },
    enabled: typeof window !== "undefined" && enabled && canRead,
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

/** Allowlist lapis-kedua (F3.3): hanya data-URL PNG/JPEG — sama dengan regex backend. */
export const SAFE_LOGO_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export function isSafeLogo(value: string): boolean {
  return SAFE_LOGO_PATTERN.test(value);
}

export const escHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Baris kop perusahaan untuk template cetak (window.print). */
export function companyKopHtml(company: CompanySettings | undefined): string {
  const name = company?.["company.name"]?.trim() || "KelolaGudang";
  const meta = [company?.["company.address"]?.trim(), company?.["company.phone"]?.trim()]
    .filter(Boolean)
    .join(" · ");
  const logo = company?.["company.logo"]?.trim() || "";
  // Tolak nilai di luar allowlist (lapisan kedua; backend sudah me-regex).
  const logoImg = logo && isSafeLogo(logo) ? `<img class="kop-logo" src="${logo}" alt="" />` : "";
  return `${logoImg}<p class="mono muted">${escHtml(name)}${meta ? ` · ${escHtml(meta)}` : ""}</p>`;
}
