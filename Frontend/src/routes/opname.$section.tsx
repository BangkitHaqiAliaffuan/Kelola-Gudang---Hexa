import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Barcode,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  ListChecks,
  Play,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatIDR, formatNumber, opnameLines, opnameSessions } from "@/lib/wms-data";

const sections: Record<string, { title: string; description: string }> = {
  jadwal: { title: "Jadwal Opname", description: "Rencana pelaksanaan dan status penyelesaian" },
  proses: { title: "Proses Opname", description: "Aktivitas mulai, pencatatan fisik, sampai selesai" },
  laporan: { title: "Laporan Opname", description: "Ringkasan dan detail hasil tiap sesi opname" },
};

export const Route = createFileRoute("/opname/$section")({
  head: ({ params }) => {
    const cfg = sections[params.section] ?? sections["jadwal"]!;
    const title = `${cfg.title} — KelolaGudang`;
    return {
      meta: [
        { title },
        { name: "description", content: cfg.description },
        { property: "og:title", content: title },
        { property: "og:description", content: cfg.description },
      ],
    };
  },
  component: Opname,
});

function Opname() {
  const { section } = Route.useParams();
  const cfg = sections[section] ?? sections["jadwal"]!;
  const running = opnameSessions.filter((o) => o.status === "Berjalan");
  const [scan, setScan] = useState("");
  const [active, setActive] = useState(running[0]?.id ?? opnameSessions[0]!.id);
  const lines = opnameLines(active);

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          section === "jadwal" ? (
            <Button className="rounded-xl" onClick={() => toast.success("Jadwal opname dibuat")}>
              <CalendarDays className="h-4 w-4" /> Buat Jadwal
            </Button>
          ) : section === "proses" ? (
            <Button className="rounded-xl" onClick={() => toast.success("Sesi opname dimulai")}>
              <Play className="h-4 w-4" /> Mulai Opname
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Laporan diexport")}>
              <ClipboardCheck className="h-4 w-4" /> Export Laporan
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sedang Berjalan" value={String(running.length)} icon={ClipboardCheck} />
        <StatCard
          label="Belum Dicek"
          value={formatNumber(opnameSessions.reduce((a, b) => a + (b.total - b.checked), 0))}
          icon={ListChecks}
          tone="warning"
        />
        <StatCard
          label="Sudah Dicek"
          value={formatNumber(opnameSessions.reduce((a, b) => a + b.checked, 0))}
          icon={CheckCheck}
          tone="success"
        />
        <StatCard
          label="Selisih"
          value={formatNumber(opnameSessions.reduce((a, b) => a + b.diff, 0))}
          icon={TriangleAlert}
          tone="danger"
        />
      </div>

      {section === "jadwal" && (
        <Panel title="Jadwal Pelaksanaan" description="Rencana opname per gudang beserta statusnya">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {["Kode", "Gudang", "Tanggal", "Cakupan", "PIC", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opnameSessions.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{o.id}</td>
                    <td className="px-3 py-2.5">{o.warehouse}</td>
                    <td className="px-3 py-2.5">{o.scheduled}</td>
                    <td className="px-3 py-2.5">{formatNumber(o.total)} SKU</td>
                    <td className="px-3 py-2.5">{o.pic}</td>
                    <td className="px-3 py-2.5">
                      <Pill tone={o.status === "Berjalan" ? "warning" : o.status === "Selesai" ? "success" : "info"}>
                        {o.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {opnameSessions.map((o) => (
              <div key={o.id} className="rounded-xl border border-border p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate text-sm font-semibold">{o.warehouse}</p>
                  <Pill tone={o.status === "Berjalan" ? "warning" : o.status === "Selesai" ? "success" : "info"}>
                    {o.status}
                  </Pill>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {o.id} · {o.scheduled} · {formatNumber(o.total)} SKU · PIC {o.pic}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {section === "proses" && (
        <>
          <Panel title="Record Opname" description="Pilih sesi untuk mulai mencatat">
            <div className="space-y-4">
              {opnameSessions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActive(o.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    active === o.id ? "border-primary/40 bg-primary-soft" : "border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{o.warehouse}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.id} · {o.scheduled} · PIC {o.pic}
                      </p>
                    </div>
                    <Pill tone={o.status === "Berjalan" ? "warning" : o.status === "Selesai" ? "success" : "info"}>
                      {o.status}
                    </Pill>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={(o.checked / o.total) * 100} className="h-2" />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {o.checked}/{o.total} · selisih {o.diff}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={`Pencatatan Fisik — ${active}`} description="Scan barcode lalu masukkan qty fisik">
            <div className="mb-4 flex gap-2">
              <Input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Scan / ketik barcode..."
                className="max-w-sm rounded-xl font-mono"
              />
              <Button variant="outline" className="rounded-xl" onClick={() => toast.info("Scanner aktif")}>
                <Barcode className="h-4 w-4" /> Scan
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((l) => (
                <div
                  key={l.id}
                  className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {l.sku} · satuan {l.unit}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground">Sistem</p>
                    <b>
                      {formatNumber(l.system)} {l.unit}
                    </b>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground">Fisik</p>
                    <Input defaultValue={l.physical} className="h-8 w-24 rounded-lg" />
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground">Selisih</p>
                    <Pill tone={l.diff === 0 ? "success" : "danger"}>
                      {l.diff} {l.unit}
                    </Pill>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => toast.success("Draft opname disimpan")}>
                Simpan Draft
              </Button>
              <Button className="rounded-xl" onClick={() => toast.success("Opname selesai diposting")}>
                Selesaikan Opname
              </Button>
            </div>
          </Panel>
        </>
      )}

      {section === "laporan" && (
        <>
          <Panel title="Summary per Sesi" description="Ringkasan hasil dan selisih tiap opname">
            <div className="grid gap-3 md:grid-cols-2">
              {opnameSessions.map((o) => {
                const ls = opnameLines(o.id);
                const plus = ls.filter((l) => l.diff > 0).length;
                const minus = ls.filter((l) => l.diff < 0).length;
                const value = ls.reduce((a, l) => a + l.value, 0);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setActive(o.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      active === o.id ? "border-primary/40 bg-primary-soft" : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-semibold">{o.warehouse}</p>
                      <Pill tone={o.status === "Selesai" ? "success" : "info"}>{o.status}</Pill>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.id} · {o.scheduled}
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                      <div>
                        <p className="text-muted-foreground">Item</p>
                        <b>{formatNumber(o.total)}</b>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tercatat</p>
                        <b>{formatNumber(o.checked)}</b>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lebih</p>
                        <b className="text-success">{plus}</b>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Kurang</p>
                        <b className="text-destructive">{minus}</b>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nilai selisih: <b className="text-foreground">{formatIDR(value)}</b>
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title={`Detail Selisih — ${active}`} description="Perbandingan stok sistem dan fisik">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {["Barang", "SKU", "Satuan", "Sistem", "Fisik", "Selisih", "Nilai Selisih"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 hover:bg-accent/40">
                      <td className="px-3 py-2.5">{l.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2.5">{l.unit}</td>
                      <td className="px-3 py-2.5 text-right">{formatNumber(l.system)}</td>
                      <td className="px-3 py-2.5 text-right">{formatNumber(l.physical)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Pill tone={l.diff === 0 ? "success" : l.diff > 0 ? "info" : "danger"}>
                          {l.diff} {l.unit}
                        </Pill>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatIDR(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {lines.map((l) => (
                <div key={l.id} className="rounded-xl border border-border p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <Pill tone={l.diff === 0 ? "success" : l.diff > 0 ? "info" : "danger"}>
                      {l.diff} {l.unit}
                    </Pill>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">{l.sku}</p>
                  <p className="mt-1 text-xs">
                    Sistem <b>{formatNumber(l.system)}</b> · Fisik <b>{formatNumber(l.physical)}</b> ·{" "}
                    <b>{formatIDR(l.value)}</b>
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}