import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, Download, History, Search, Settings2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  ClearFiltersButton,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { themes, useTheme } from "@/components/wms/theme";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber } from "@/lib/wms-data";
import { AUDIT_ACTIONS, useAuditLogs, type AuditLogApi } from "@/hooks/use-audit";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/use-settings";
import { api, fieldError, getAuthToken, isApiError } from "@/lib/api";
import { API_CATALOG, API_PAYLOAD_EXAMPLES, type ApiCatalogEntry } from "@/lib/api-catalog";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useAuth } from "@/hooks/use-auth";

const meta: Record<string, { title: string; description: string }> = {
  "audit-trails": {
    title: "Audit Trails",
    description: "Rekam jejak seluruh aktivitas pengguna pada sistem",
  },
  "general-setting": {
    title: "General Setting",
    description: "Profil perusahaan, penomoran dokumen, dan preferensi sistem",
  },
  developer: {
    title: "Developer",
    description: "Dokumentasi teknis, struktur modul, dan referensi integrasi",
  },
};

export const Route = createFileRoute("/system/$section")({
  beforeLoad: ({ params }) => {
    if (!(params.section in meta)) throw notFound();
  },
  head: ({ params }) => {
    const m = meta[params.section];
    const title = `${m?.title ?? "System"} — KelolaGudang`;
    const description = m?.description ?? "Modul system KelolaGudang.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: SystemPage,
});

const actionTone = (a: string): Tone =>
  a === "Create" || a === "Approve" || a === "Post" || a === "Submit"
    ? "success"
    : a === "Delete" || a === "Reject"
      ? "danger"
      : a === "Update" || a === "Cancel" || a === "Force Unlock"
        ? "warning"
        : a === "Login" || a === "Logout"
          ? "info"
          : "neutral";

const AUDIT_MODULES = [
  "Master Data",
  "Transaksi",
  "Persediaan",
  "Stock Opname",
  "Pengadaan",
  "Approval Pengadaan",
  "Laporan",
  "System",
  "Audit Trails",
];

const PAGE_SIZE = 20;

function diffSummary(r: AuditLogApi): string {
  const changes = r.new_values ?? {};
  const olds = r.old_values ?? {};
  const keys = Object.keys(changes)
    .filter((k) => k !== "updated_at")
    .slice(0, 2);
  if (keys.length === 0) {
    if (r.action === "Delete") return "dihapus";
    if (r.action === "Create") return "baru";
    return "—";
  }
  return keys
    .map((k) => {
      const before = olds[k];
      const after = (changes as Record<string, unknown>)[k];
      const fmt = (v: unknown) => (v === null || v === undefined ? "—" : String(v).slice(0, 24));
      return `${k}: ${fmt(before)} → ${fmt(after)}`;
    })
    .join("; ");
}

function AuditTrails() {
  const { status: authStatus, hasModuleLevel } = useAuth();
  const canView = hasModuleLevel("Audit Trails", "Baca");
  const noAccess = authStatus === "authenticated" && !canView;

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [action, setAction] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const hasActiveFilters = useMemo(
    () => q !== "" || action !== ALL || module !== ALL || from !== "" || to !== "",
    [q, action, module, from, to],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setAction(ALL);
    setModule(ALL);
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, action, module, from, to]);

  const rangeValid = !from || !to || from <= to;

  const { data, isLoading, isFetching, error, refetch } = useAuditLogs({
    action: action === ALL ? null : action,
    module: module === ALL ? null : module,
    from: from || null,
    to: to || null,
    search: debouncedQ.trim() || null,
    perPage: PAGE_SIZE,
    page,
    enabled: canView && rangeValid,
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const lastPage = data?.meta?.last_page ?? 1;

  const handleExport = () => {
    const content = toCsv(
      rows.map((r) => ({
        waktu: r.occurred_at ?? "",
        pengguna: r.user_name ?? "",
        role: r.role ?? "",
        aksi: r.action,
        modul: r.module ?? "",
        record: r.record_no ?? "",
        ip: r.ip_address ?? "",
        detail: diffSummary(r),
      })),
      [
        { key: "waktu", label: "Waktu" },
        { key: "pengguna", label: "Pengguna" },
        { key: "role", label: "Role" },
        { key: "aksi", label: "Aksi" },
        { key: "modul", label: "Modul" },
        { key: "record", label: "Record" },
        { key: "ip", label: "IP" },
        { key: "detail", label: "Detail" },
      ],
    );
    downloadCsv(`audit-trails-${new Date().toISOString().slice(0, 10)}.csv`, content);
    toast.success(`Export ${formatNumber(rows.length)} baris`);
  };

  const columns: Column<AuditLogApi>[] = [
    {
      key: "time",
      label: "Waktu",
      className: "whitespace-nowrap",
      render: (r) => (r.occurred_at ? formatDateTime(r.occurred_at) : "—"),
    },
    {
      key: "user",
      label: "Pengguna",
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{r.user_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{r.role ?? ""}</p>
        </div>
      ),
    },
    {
      key: "action",
      label: "Aksi",
      render: (r) => <Pill tone={actionTone(r.action)}>{r.action}</Pill>,
    },
    { key: "module", label: "Modul", render: (r) => r.module ?? "—" },
    {
      key: "record",
      label: "Record",
      render: (r) => <span className="font-mono text-xs">{r.record_no ?? "—"}</span>,
    },
    {
      key: "detail",
      label: "Detail",
      render: (r) => (
        <span
          className="block max-w-[260px] truncate text-xs text-muted-foreground"
          title={diffSummary(r)}
        >
          {diffSummary(r)}
        </span>
      ),
    },
    {
      key: "ip",
      label: "IP Address",
      render: (r) => <span className="font-mono text-xs">{r.ip_address ?? "—"}</span>,
    },
  ];

  if (noAccess) {
    return (
      <Panel title="Log Aktivitas">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Akun Anda tidak memiliki akses Baca pada modul Audit Trails. Hubungi administrator untuk
          mengatur hak akses.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Log Aktivitas"
      description={`${formatNumber(total)} entri tercatat${isFetching ? " · memperbarui..." : ""}`}
      actions={
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={handleExport}
          disabled={rows.length === 0}
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-2.5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari pengguna, record, IP..."
            className="rounded-xl pl-9"
          />
        </div>
        <FilterSelect
          className="w-full flex-1 min-w-[140px] max-w-[180px]"
          value={action}
          onChange={setAction}
          placeholder="Semua Aksi"
          options={[...AUDIT_ACTIONS]}
        />
        <FilterSelect
          className="w-full flex-1 min-w-[140px] max-w-[180px]"
          value={module}
          onChange={setModule}
          placeholder="Semua Modul"
          options={AUDIT_MODULES}
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Dari tanggal"
          className="rounded-xl"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Sampai tanggal"
          className="rounded-xl"
        />
        <div className="ml-auto flex shrink-0 items-end">
          <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        pageSize={PAGE_SIZE}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        serverPage={page}
        serverTotalRows={total}
        serverTotalPages={lastPage}
        onServerPageChange={setPage}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{r.user_name ?? "—"}</p>
              <Pill tone={actionTone(r.action)}>{r.action}</Pill>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.occurred_at ? formatDateTime(r.occurred_at) : "—"} · {r.module ?? "—"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {r.record_no ?? "—"} · {r.ip_address ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">{diffSummary(r)}</p>
          </div>
        )}
      />
    </Panel>
  );
}

const PROFILE_FIELDS: Array<{ label: string; fieldKey: string; placeholder?: string }> = [
  { label: "Nama Perusahaan", fieldKey: "company.name" },
  { label: "NPWP", fieldKey: "company.npwp", placeholder: "15/16 digit" },
  { label: "Alamat", fieldKey: "company.address" },
  { label: "Telepon", fieldKey: "company.phone" },
  { label: "Email", fieldKey: "company.email" },
  { label: "Mata Uang", fieldKey: "company.currency", placeholder: "IDR" },
];

function GeneralSetting() {
  const { theme, setTheme } = useTheme();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("System", "Tulis");

  const { data: settings, isLoading: settingsLoading, error: settingsError } = useCompanySettings();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (settings && draft === null) setDraft({ ...settings });
  }, [settings, draft]);
  const save = useUpdateCompanySettings();
  const values = draft ?? settings ?? {};
  const handleSave = () => {
    const company: Record<string, string | null> = {};
    for (const f of PROFILE_FIELDS) {
      const v = (values[f.fieldKey] ?? "").trim();
      company[f.fieldKey.replace("company.", "")] = v === "" ? null : v;
    }
    save.mutate(company, {
      onSuccess: (res) => {
        setDraft(null);
        toast.success(res.message || "Pengaturan disimpan");
      },
      onError: () => {
        toast.error("Gagal menyimpan — periksa kembali isian.");
      },
    });
  };

  return (
    <>
      <Panel
        title="Profil Perusahaan"
        description="Tampil pada kop dokumen cetakan"
        actions={
          canWrite && (
            <Button
              className="rounded-xl"
              onClick={handleSave}
              disabled={settingsLoading || save.isPending}
            >
              <Save className="h-4 w-4" />
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          )
        }
      >
        {settingsLoading && draft === null ? (
          <p className="text-sm text-muted-foreground">Memuat pengaturan...</p>
        ) : settingsError && draft === null ? (
          <p className="text-sm text-destructive">
            Tidak dapat memuat pengaturan.{" "}
            {canWrite ? "Coba lagi sesaat lagi." : "Hubungi administrator."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => {
              const err = fieldError(save.error, f.fieldKey);
              return (
                <div key={f.fieldKey} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Input
                    value={values[f.fieldKey] ?? ""}
                    placeholder={f.placeholder}
                    readOnly={!canWrite}
                    className="rounded-xl"
                    onChange={(e) =>
                      setDraft((d) => ({ ...(d ?? values), [f.fieldKey]: e.target.value }))
                    }
                  />
                  {err && <p className="text-xs text-destructive">{err}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Preferensi Operasional" actions={<Pill tone="neutral">Segera</Pill>}>
        <div className="space-y-2">
          {[
            ["Aktifkan approval berjenjang", true],
            ["Izinkan stok negatif", false],
            ["Wajib scan barcode saat penerimaan", true],
            ["Kunci periode setelah tutup bulan", true],
          ].map(([label, def]) => (
            <div
              key={label as string}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-3"
            >
              <Label className="text-sm font-medium">{label as string}</Label>
              <Switch defaultChecked={def as boolean} disabled={!canWrite} />
            </div>
          ))}
        </div>
        <Separator className="my-5" />
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Tema Pastel Default</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent",
                theme === t.id ? "border-primary/40 bg-primary-soft" : "border-border",
              )}
            >
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: t.swatch }} />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}

const docSections = [
  {
    title: "Arsitektur Aplikasi",
    body: "Frontend TanStack Start (SSR) + React 19 memanggil API Laravel 13 di bawah prefix /api. Auth Sanctum bearer-token (localStorage kg-token). Database PostgreSQL 16. Kebenaran stok adalah ledger item_stock + stock_movements; kolom items.stock/reserved hanya proyeksi.",
  },
  {
    title: "Modul & Gerbang API",
    body: "Master Data (/api/master/*) · Persediaan (/api/persediaan/*) · Pengadaan (/api/pengadaan/*) · Laporan (/api/laporan/*) · System (/api/system/*). Level kebutuhan dari HTTP verb: GET/HEAD=Baca, POST/PUT/PATCH=Tulis, DELETE=Kelola; tanpa baris (role,module) berarti tanpa akses.",
  },
  {
    title: "Konvensi Penomoran",
    body: "Counter atomik via tabel document_counters. Format per tahun: BM/BK/RP/RJ/ADJ/TF/SO/{YYYY}/{#####}, WO/{YYYY}/{####}; kode master: USR-###, DEP-###, PRJ-###, RAK/BIN/SUP/CUS/VDR-###.",
  },
];

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} disalin`);
  } catch {
    toast.error("Gagal menyalin ke clipboard");
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const methodTone = (m: string): Tone =>
  m === "GET" ? "info" : m === "DELETE" ? "danger" : "success";

function Diagnostics() {
  const { user, access, status } = useAuth();
  const [probe, setProbe] = useState<{ ok: boolean; ms: number; message: string } | null>(null);
  const [probing, setProbing] = useState(false);

  const runProbe = useCallback(async () => {
    setProbing(true);
    const t0 = performance.now();
    try {
      await api.get<{ data: unknown }>("/auth/me");
      setProbe({ ok: true, ms: Math.round(performance.now() - t0), message: "Backend merespons" });
    } catch (err) {
      setProbe({
        ok: false,
        ms: Math.round(performance.now() - t0),
        message: err instanceof Error ? err.message : "Gagal terhubung",
      });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  const hasToken = getAuthToken() !== null;

  return (
    <Panel
      title="Diagnostik Sistem"
      description="Status koneksi backend dan sesi saat ini"
      actions={
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => void runProbe()}
          disabled={probing}
        >
          {probing ? "Memeriksa..." : "Periksa lagi"}
        </Button>
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Backend</p>
          <p className="text-sm font-semibold">
            {probe == null ? "…" : probe.ok ? `OK · ${probe.ms} ms` : "Terputus"}
          </p>
          {probe && !probe.ok && (
            <p className="mt-0.5 text-[11px] text-destructive">{probe.message}</p>
          )}
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Pengguna</p>
          <p className="truncate text-sm font-semibold">
            {status !== "authenticated" ? "Belum login" : (user?.name ?? "—")}
          </p>
          <p className="text-[11px] text-muted-foreground">{user?.role ?? ""}</p>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Token (kg-token)</p>
          <p className="text-sm font-semibold">{hasToken ? "Tersimpan" : "Tidak ada"}</p>
          <p className="text-[11px] text-muted-foreground">Kedaluarsa 24 jam sejak login</p>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Hak Akses</p>
          <p className="text-sm font-semibold">{access.length} modul</p>
          <p className="text-[11px] text-muted-foreground">
            {access.map((a) => `${a.module}: ${a.level}`).join(" · ") || "—"}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ApiReference() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [group, setGroup] = useState(ALL);

  const groups = useMemo(() => API_CATALOG.map((g) => g.group), []);
  const rows = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return API_CATALOG.filter((g) => group === ALL || g.group === group).flatMap((g) =>
      g.entries
        .filter(
          (e) =>
            !needle || `${e.method} ${e.path} ${e.desc} ${e.gate}`.toLowerCase().includes(needle),
        )
        .map((e) => ({ ...e, group: g.group })),
    );
  }, [debouncedQ, group]);

  return (
    <Panel
      title="Referensi API"
      description={`Kontrak nyata backend (${rows.length} endpoint)`}
      actions={
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => {
            downloadJson("api-catalog.json", API_CATALOG);
            toast.success("Katalog diunduh");
          }}
        >
          <Download className="h-4 w-4" />
          Unduh Katalog JSON
        </Button>
      }
    >
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari method, path, deskripsi..."
            className="rounded-xl pl-9"
          />
        </div>
        <FilterSelect
          className="w-full"
          value={group}
          onChange={setGroup}
          placeholder="Semua Grup"
          options={groups}
        />
        <div className="flex items-end">
          <ClearFiltersButton
            visible={q !== "" || group !== ALL}
            onClick={() => {
              setQ("");
              setGroup(ALL);
            }}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Deskripsi</th>
              <th className="px-3 py-2">Gerbang</th>
              <th className="px-3 py-2 text-right">Salin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={`${e.method} ${e.path}`} className="border-t border-border/70">
                <td className="px-3 py-2">
                  <Pill tone={methodTone(e.method)}>{e.method}</Pill>
                </td>
                <td className="px-3 py-2 font-mono text-xs">/api{e.path}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.desc}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{e.gate}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => void copyText(`${e.method} /api${e.path}`, "Endpoint")}
                  >
                    Salin
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Tidak ada endpoint yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const GET_ENDPOINTS: (ApiCatalogEntry & { group: string })[] = API_CATALOG.flatMap((g) =>
  g.entries.filter((e) => e.method === "GET").map((e) => ({ ...e, group: g.group })),
);

function TryItConsole() {
  const [selected, setSelected] = useState<string>(GET_ENDPOINTS[0]?.path ?? "");
  const entry = useMemo(
    () => GET_ENDPOINTS.find((e) => e.path === selected) ?? GET_ENDPOINTS[0]!,
    [selected],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    status: number | null;
    ms: number;
    body: unknown;
    error?: string;
  } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setValues({});
    setResult(null);
  }, [selected]);

  const run = async () => {
    setRunning(true);
    const sp = new URLSearchParams();
    for (const p of entry.params ?? []) {
      const v = (values[p.name] ?? "").trim();
      if (v) sp.set(p.name, v);
      else if (p.required) {
        toast.error(`Param ${p.name} wajib diisi`);
        setRunning(false);
        return;
      }
    }
    const qs = sp.toString();
    const t0 = performance.now();
    try {
      const body = await api.get<unknown>(`${entry.path}${qs ? `?${qs}` : ""}`);
      setResult({ status: 200, ms: Math.round(performance.now() - t0), body });
    } catch (err) {
      setResult({
        status: isApiError(err) ? err.status : null,
        ms: Math.round(performance.now() - t0),
        body: null,
        error: err instanceof Error ? err.message : "Gagal",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel
      title="Konsol Coba (GET saja)"
      description="Eksekusi endpoint baca dengan token aktif — tanpa risiko ubah data"
      actions={
        <Button className="rounded-xl" onClick={() => void run()} disabled={running}>
          {running ? "Menjalankan..." : "Jalankan"}
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <FilterSelect
          className="w-full"
          value={selected}
          onChange={setSelected}
          placeholder="Pilih endpoint"
          options={GET_ENDPOINTS.map((e) => ({
            value: e.path,
            label: `GET /api${e.path} — ${e.desc}`,
          }))}
        />
        <p className="text-xs text-muted-foreground self-center">Gerbang: {entry.gate}</p>
      </div>
      {(entry.params ?? []).length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(entry.params ?? []).map((p) => (
            <div key={p.name} className="space-y-1.5">
              <Label>
                {p.name}
                {p.required && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                value={values[p.name] ?? ""}
                placeholder={p.placeholder ?? p.name}
                className="rounded-xl font-mono text-xs"
                onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      {result && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <Pill tone={result.error ? "danger" : "success"}>
              {result.error
                ? `Error${result.status != null ? ` ${result.status}` : ""}`
                : `200 · ${result.ms} ms`}
            </Pill>
            {result.body != null && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => void copyText(JSON.stringify(result.body, null, 2), "Respons")}
              >
                Salin JSON
              </Button>
            )}
          </div>
          <pre className="max-h-96 overflow-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed">
            {result.error ?? JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

function Developer() {
  return (
    <>
      <Diagnostics />

      <Panel title="Dokumentasi" description="Panduan teknis untuk tim pengembang">
        <div className="grid gap-3 md:grid-cols-3">
          {docSections.map((d) => (
            <div key={d.title} className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{d.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d.body}</p>
            </div>
          ))}
        </div>
      </Panel>

      <ApiReference />

      <TryItConsole />

      <Panel title="Contoh Payload" description="Body nyata untuk endpoint tulis">
        <div className="space-y-3">
          {API_PAYLOAD_EXAMPLES.map((ex) => (
            <div key={ex.title}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="font-mono text-xs font-semibold">{ex.title}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => void copyText(ex.body, "Payload")}
                >
                  Salin
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
                {ex.body}
              </pre>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function SystemPage() {
  const { section } = Route.useParams();
  const m = meta[section]!;
  const Icon = section === "audit-trails" ? History : section === "developer" ? Code2 : Settings2;

  return (
    <>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-5 w-5" />
          </span>
        }
      />
      {section === "audit-trails" && <AuditTrails />}
      {section === "general-setting" && <GeneralSetting />}
      {section === "developer" && <Developer />}
    </>
  );
}
