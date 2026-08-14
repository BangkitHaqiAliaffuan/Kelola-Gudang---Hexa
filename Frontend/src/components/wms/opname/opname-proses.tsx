import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  CheckCheck,
  ClipboardCheck,
  ListChecks,
  Play,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import {
  opnameLabel,
  opnameLabelTone,
  opnameProgress,
  useOpnameAnalytics,
} from "@/components/wms/opname/opname-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import {
  useCancelStockDocument,
  usePostStockDocument,
  useStockDocument,
  useStockDocuments,
  useUpdateStockDocument,
} from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { isApiError } from "@/lib/api";

export function OpnameProsesPage() {
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Persediaan", "Tulis");

  const { data, isLoading: listLoading } = useStockDocuments({ type: "Stock Opname" });
  const sessions = useMemo(() => data?.data ?? [], [data]);
  const analytics = useOpnameAnalytics(sessions);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [scan, setScan] = useState("");
  const [records, setRecords] = useState<Record<number, string>>({});
  const scanRef = useRef<HTMLInputElement>(null);

  const update = useUpdateStockDocument();
  const post = usePostStockDocument();
  const cancel = useCancelStockDocument();

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );
  const { data: detail, isLoading: detailLoading } = useStockDocument(activeId ?? undefined);
  const lines = useMemo(() => detail?.data?.lines ?? [], [detail?.data]);

  useEffect(() => {
    const drafts = sessions.filter((s) => s.status === "Draft");
    const target = drafts.length > 0 ? drafts[0] : (sessions[0] ?? null);
    if (target && activeId !== target.id) {
      setActiveId(target.id);
    }
  }, [sessions, activeId]);

  useEffect(() => {
    if (activeId == null) return;
    setRecords(
      Object.fromEntries(
        lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
      ),
    );
  }, [activeId, lines]);

  const scanQ = scan.trim().toLowerCase();
  const filteredLines = useMemo(
    () =>
      scanQ
        ? lines.filter(
            (l) =>
              (l.sku ?? "").toLowerCase().includes(scanQ) ||
              (l.name ?? "").toLowerCase().includes(scanQ),
          )
        : lines,
    [lines, scanQ],
  );

  const localChecked = lines.filter((l) => (records[l.id] ?? "").trim() !== "").length;
  const uncounted = lines.length - localChecked;
  const totalVariance = lines.reduce((acc, l) => {
    const raw = (records[l.id] ?? "").trim();
    return acc + (raw === "" ? 0 : Number(raw) - (l.system_qty ?? 0));
  }, 0);

  const dirty = useMemo(() => {
    const initial = new Map(
      lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
    );
    return lines.some((l) => (records[l.id] ?? "") !== initial.get(l.id));
  }, [lines, records]);

  const buildLines = () =>
    lines
      .filter((l) => l.from_bin_id != null)
      .map((l) => {
        const raw = (records[l.id] ?? "").trim();
        return {
          item_id: l.item_id,
          from_bin_id: l.from_bin_id!,
          system_qty: l.system_qty,
          actual_qty: raw === "" ? null : Number(raw),
          unit_cost: l.unit_cost,
        };
      });

  const saveDraft = () => {
    if (!active) return;
    const invalid = buildLines().filter(
      (l) => l.actual_qty != null && (!Number.isInteger(l.actual_qty) || l.actual_qty < 0),
    );
    if (invalid.length > 0) {
      toast.error("Jumlah fisik harus berupa angka bulat ≥ 0");
      return;
    }

    update.mutate(
      {
        id: active.id,
        payload: { document_date: active.document_date, pic: active.pic, lines: buildLines() },
      },
      {
        onSuccess: () => toast.success("Draft opname disimpan"),
        onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal menyimpan draft"),
      },
    );
  };

  const finish = () => {
    if (!active) return;
    if (uncounted > 0) {
      toast.error(
        `${uncounted} barang belum dihitung — lengkapi semua fisik sebelum menyelesaikan.`,
      );
      return;
    }
    post.mutate(active.id, {
      onSuccess: () => toast.success("Opname selesai diposting"),
      onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal menyelesaikan opname"),
    });
  };

  const cancelSession = () => {
    if (!active) return;
    cancel.mutate(active.id, {
      onSuccess: () => toast.success("Opname dibatalkan"),
      onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal membatalkan opname"),
    });
  };

  const isDraft = active?.status === "Draft";
  const mutationsBusy = update.isPending || post.isPending || cancel.isPending;

  return (
    <>
      <PageHeader
        title="Proses Opname"
        description="Aktivitas mulai, pencatatan fisik, sampai selesai"
        actions={
          canWrite && (
            <Button
              className="rounded-xl"
              onClick={() => {
                const draft = sessions.find((s) => s.status === "Draft");
                if (draft) setActiveId(draft.id);
                else toast.info("Tidak ada sesi opname berstatus draft");
              }}
            >
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

      <Panel title="Pilih Sesi" {...(listLoading ? { description: "Memuat sesi..." } : {})}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => {
            const label = opnameLabel(s);
            const progress =
              s.id === active?.id
                ? lines.length
                  ? (localChecked / lines.length) * 100
                  : 0
                : opnameProgress(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  activeId === s.id
                    ? "border-primary/40 bg-primary-soft"
                    : "border-border hover:bg-accent/40"
                }`}
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
                  <Progress value={progress} className="h-2" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.id === active?.id
                      ? `${localChecked}/${lines.length}`
                      : `${s.checked_count ?? 0}/${s.line_count}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={active ? `Pencatatan Fisik — ${active.no}` : "Pencatatan Fisik"}
        {...(active
          ? {
              description: `${active.warehouse ?? "—"} · ${formatDate(active.document_date)} · PIC ${active.pic ?? "—"} · ${uncounted} belum dicek`,
            }
          : {})}
        actions={
          active && isDraft && canWrite ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={mutationsBusy}
                onClick={cancelSession}
              >
                <X className="h-4 w-4" /> Batalkan
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={mutationsBusy || !dirty}
                onClick={saveDraft}
              >
                Simpan Draft
              </Button>
              <Button
                className="rounded-xl"
                disabled={mutationsBusy || uncounted > 0}
                onClick={finish}
                title={uncounted > 0 ? `${uncounted} barang belum dihitung` : undefined}
              >
                Selesaikan Opname
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailLoading && !active ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Memuat sesi...</p>
        ) : !active ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tidak ada sesi opname. Buat jadwal dari halaman Jadwal Opname.
          </p>
        ) : (
          <>
            {canWrite && isDraft && (
              <div className="mb-4 flex gap-2">
                <Input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder="Scan / ketik SKU untuk filter..."
                  className="max-w-sm rounded-xl font-mono"
                />
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => scanRef.current?.focus()}
                >
                  <Barcode className="h-4 w-4" /> Scan
                </Button>
              </div>
            )}
            <div className="space-y-3">
              {filteredLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Tidak ada baris yang cocok.
                </p>
              ) : (
                filteredLines.map((l) => {
                  const raw = (records[l.id] ?? "").trim();
                  const value = raw === "" ? null : Number(raw);
                  const variance = value == null ? null : value - (l.system_qty ?? 0);
                  return (
                    <div
                      key={l.id}
                      className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name ?? "—"}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {l.sku ?? "—"} · satuan {l.unit ?? "—"} · Rak {l.from_rack ?? "—"} · Bin{" "}
                          {l.from_bin ?? "—"}
                        </p>
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Sistem</p>
                        <b>
                          {formatNumber(l.system_qty ?? 0)} {l.unit ?? ""}
                        </b>
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Fisik</p>
                        {canWrite && isDraft ? (
                          <Input
                            type="number"
                            min={0}
                            value={raw}
                            onChange={(e) =>
                              setRecords((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            className="h-8 w-24 rounded-lg"
                          />
                        ) : (
                          <b>
                            {formatNumber(l.actual_qty ?? 0)} {l.unit ?? ""}
                          </b>
                        )}
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Selisih</p>
                        <Pill
                          tone={
                            variance == null
                              ? "neutral"
                              : variance === 0
                                ? "success"
                                : variance > 0
                                  ? "info"
                                  : "danger"
                          }
                        >
                          {variance == null ? "—" : `${variance} ${l.unit ?? ""}`}
                        </Pill>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {!isDraft && (
              <p className="mt-4 text-xs text-muted-foreground">
                Sesi {active.status === "Selesai" ? "telah selesai diposting" : "tidak lagi aktif"}{" "}
                — hanya sesi Draft yang dapat dicatat.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
