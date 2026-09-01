import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
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
import { auditLogs, formatDate, type AuditLog } from "@/lib/wms-data";
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

const actionTone = (a: AuditLog["action"]): Tone =>
  a === "Create"
    ? "success"
    : a === "Delete"
      ? "danger"
      : a === "Approve"
        ? "brand"
        : a === "Login"
          ? "info"
          : "neutral";

function AuditTrails() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [action, setAction] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const hasActiveFilters = useMemo(
    () => q !== "" || action !== ALL || module !== ALL,
    [q, action, module],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setAction(ALL);
    setModule(ALL);
  }, []);

  const actions = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.action))), []);
  const modules = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.module))), []);

  const rows = useMemo(
    () =>
      auditLogs.filter((l) => {
        const okQ =
          !debouncedQ ||
          [l.user, l.record, l.module, l.ip]
            .join(" ")
            .toLowerCase()
            .includes(debouncedQ.toLowerCase());
        return (
          okQ && (action === ALL || l.action === action) && (module === ALL || l.module === module)
        );
      }),
    [debouncedQ, action, module],
  );

  const columns: Column<AuditLog>[] = [
    { key: "time", label: "Waktu", render: (r) => formatDate(r.time) },
    {
      key: "user",
      label: "Pengguna",
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{r.user}</p>
          <p className="text-xs text-muted-foreground">{r.role}</p>
        </div>
      ),
    },
    {
      key: "action",
      label: "Aksi",
      render: (r) => <Pill tone={actionTone(r.action)}>{r.action}</Pill>,
    },
    { key: "module", label: "Modul", render: (r) => r.module },
    {
      key: "record",
      label: "Record",
      render: (r) => <span className="font-mono text-xs">{r.record}</span>,
    },
    {
      key: "ip",
      label: "IP Address",
      render: (r) => <span className="font-mono text-xs">{r.ip}</span>,
    },
  ];

  return (
    <Panel title="Log Aktivitas" description={`${rows.length} entri tercatat`}>
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
          options={actions}
        />
        <FilterSelect
          className="w-full flex-1 min-w-[140px] max-w-[180px]"
          value={module}
          onChange={setModule}
          placeholder="Semua Modul"
          options={modules}
        />
        <div className="ml-auto flex shrink-0 items-end">
          <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{r.user}</p>
              <Pill tone={actionTone(r.action)}>{r.action}</Pill>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(r.time)} · {r.module}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {r.record} · {r.ip}
            </p>
          </div>
        )}
      />
    </Panel>
  );
}

function GeneralSetting() {
  const { theme, setTheme } = useTheme();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("System", "Tulis");
  return (
    <>
      <Panel
        title="Profil Perusahaan"
        actions={
          canWrite && (
            <Button className="rounded-xl" onClick={() => toast.success("Pengaturan disimpan")}>
              <Save className="h-4 w-4" />
              Simpan
            </Button>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Nama Perusahaan", "PT Kelola Nusantara"],
            ["NPWP", "01.234.567.8-091.000"],
            ["Alamat", "Jl. Industri Raya No. 88, Bekasi"],
            ["Telepon", "021-8899-2233"],
            ["Email", "ops@kelolagudang.id"],
            ["Mata Uang", "IDR (Rupiah)"],
          ].map(([label, val]) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Input defaultValue={val} readOnly={!canWrite} className="rounded-xl" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Penomoran Dokumen" description="Format otomatis nomor dokumen">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Barang Masuk", "BM/{YYYY}/{00000}"],
            ["Barang Keluar", "BK/{YYYY}/{00000}"],
            ["Purchase Request", "PR/{YYYY}/{0000}"],
            ["Purchase Order", "PO/{YYYY}/{0000}"],
            ["Receive Goods", "GR/{YYYY}/{0000}"],
            ["Stock Opname", "SO/{YYYY}/{0000}"],
          ].map(([label, val]) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                defaultValue={val}
                readOnly={!canWrite}
                className="rounded-xl font-mono text-xs"
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Preferensi Operasional">
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
    body: "KelolaGudang dibangun dengan React 19 + TanStack Start (SSR), Tailwind CSS v4, dan komponen shadcn/ui. Seluruh data pada versi ini adalah dummy data yang dihasilkan di src/lib/wms-data.ts.",
  },
  {
    title: "Struktur Modul",
    body: "Master Data · Persediaan · Transaksi · Pengadaan (PR/PO/GR) · Stock Opname · Barcode · Laporan · System. Setiap modul memiliki halaman daftar, panel detail slide-over, dan halaman form penuh untuk entri data.",
  },
  {
    title: "Konvensi Penomoran",
    body: "Format {PREFIX}/{TAHUN}/{URUT}. Contoh: BM/2026/00123, PO/2026/0045, GR/2026/0012.",
  },
];

const endpoints = [
  ["GET", "/api/items", "Daftar barang dengan filter kategori, gudang, status"],
  ["POST", "/api/transactions", "Membuat transaksi masuk/keluar/transfer"],
  ["GET", "/api/stock-card/:sku", "Kartu stock per SKU dengan saldo berjalan"],
  ["POST", "/api/procurement/pr", "Membuat purchase request"],
  ["POST", "/api/procurement/po", "Menerbitkan purchase order dari PR"],
  ["POST", "/api/procurement/gr", "Penerimaan barang berdasarkan PO"],
  ["GET", "/api/audit-logs", "Rekam jejak aktivitas pengguna"],
];

function Developer() {
  return (
    <>
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

      <Panel
        title="Referensi API (rencana)"
        description="Kontrak endpoint yang akan dipakai saat backend diaktifkan"
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => toast.success("Spesifikasi diunduh")}
          >
            <Download className="h-4 w-4" />
            Unduh OpenAPI
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2">Deskripsi</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map(([m, p, d]) => (
                <tr key={p} className="border-t border-border/70">
                  <td className="px-3 py-2">
                    <Pill tone={m === "GET" ? "info" : "success"}>{m}</Pill>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Contoh Payload" description="POST /api/transactions">
        <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
          {`{
  "type": "Barang Masuk",
  "warehouse": "GD-01",
  "partner": "PT Sinar Jaya Abadi",
  "reference": "PO/2026/0045",
  "lines": [
    { "sku": "SKU-00123", "qty": 40, "unit": "PCS", "price": 125000 }
  ]
}`}
        </pre>
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
