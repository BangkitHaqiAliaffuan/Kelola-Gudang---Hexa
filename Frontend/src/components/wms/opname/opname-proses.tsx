import { useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { CheckCheck, ClipboardCheck, ListChecks, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import {
  opnameLabel,
  opnameLabelTone,
  opnameProgress,
  useOpnameAnalytics,
} from "@/components/wms/opname/opname-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";

export function OpnameProsesPage() {
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Persediaan", "Tulis");
  const router = useRouter();

  const { data, isLoading: listLoading } = useStockDocuments({ type: "Stock Opname" });
  const sessions = useMemo(() => data?.data ?? [], [data]);
  const analytics = useOpnameAnalytics(sessions);

  const start = () => {
    const draft = sessions.find((s) => s.status === "Draft");
    if (draft) {
      router.navigate({ to: "/opname/proses/$docId", params: { docId: String(draft.id) } });
    } else {
      toast.info("Tidak ada sesi opname berstatus draft");
    }
  };

  return (
    <>
      <PageHeader
        title="Proses Opname"
        description="Aktivitas mulai, pencatatan fisik, sampai selesai"
        actions={
          canWrite && (
            <Button className="rounded-xl" onClick={start}>
              <Play className="h-4 w-4" /> Mulai Opname
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sedang Berjalan"
          value={formatNumber(analytics.running)}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Belum Dicek"
          value={formatNumber(analytics.unchecked)}
          icon={ListChecks}
          tone="warning"
        />
        <StatCard
          label="Sudah Dicek"
          value={formatNumber(analytics.checked)}
          icon={CheckCheck}
          tone="success"
        />
        <StatCard
          label="Selisih"
          value={formatNumber(analytics.selisih)}
          icon={TriangleAlert}
          tone="danger"
        />
      </div>

      <Panel
        title="Pilih Sesi"
        description={
          listLoading ? "Memuat sesi..." : "Pilih sesi untuk membuka halaman pencatatan fisik"
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => {
            const label = opnameLabel(s);
            return (
              <Link
                key={s.id}
                to="/opname/proses/$docId"
                params={{ docId: String(s.id) }}
                className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-accent/40"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.warehouse ?? "—"}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {s.no} · {formatDate(s.document_date)} · PIC {s.pic ?? "—"}
                    </p>
                  </div>
                  <Pill tone={opnameLabelTone(label)}>{label}</Pill>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={opnameProgress(s)} className="h-2" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.checked_count ?? 0}/{s.line_count}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
