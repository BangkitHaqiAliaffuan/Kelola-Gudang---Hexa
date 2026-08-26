import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Barcode, ChevronLeft, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/wms/kit";
import { OpnameReviewDialog } from "@/components/wms/opname/opname-review-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  useCancelStockDocument,
  useStockDocument,
  useUpdateStockDocument,
} from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { isApiError } from "@/lib/api";

export function OpnameCountPage({ docId }: { docId: number }) {
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Persediaan", "Tulis");
  const router = useRouter();

  const { data: detail, isLoading: detailLoading } = useStockDocument(docId);
  const update = useUpdateStockDocument();
  const cancel = useCancelStockDocument();

  const session = detail?.data ?? null;
  const lines = useMemo(() => detail?.data?.lines ?? [], [detail?.data]);

  const [scan, setScan] = useState("");
  const [records, setRecords] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRevealed(false);
    setRecords(
      Object.fromEntries(
        lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
      ),
    );
  }, [docId, lines]);

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
    lines.map((l) => {
      const raw = (records[l.id] ?? "").trim();
      return {
        item_id: l.item_id,
        from_bin_id: l.from_bin_id ?? null,
        system_qty: l.system_qty,
        actual_qty: raw === "" ? null : Number(raw),
        unit_cost: l.unit_cost,
      };
    });

  const goBack = () => router.navigate({ to: "/opname/$section", params: { section: "proses" } });

  const saveDraft = () => {
    if (!session) return;
    const invalid = buildLines().filter(
      (l) => l.actual_qty != null && (!Number.isInteger(l.actual_qty) || l.actual_qty < 0),
    );
    if (invalid.length > 0) {
      toast.error("Jumlah fisik harus berupa angka bulat ≥ 0");
      return;
    }

    update.mutate(
      {
        id: session.id,
        payload: {
          document_date: session.document_date,
          pic: session.pic,
          lines: buildLines(),
        },
      },
      {
        onSuccess: () => toast.success("Draft opname disimpan"),
        onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal menyimpan draft"),
      },
    );
  };

  const finish = () => {
    if (!session) return;
    if (uncounted > 0) {
      toast.error(
        `${uncounted} barang belum dihitung — lengkapi semua fisik sebelum menyelesaikan.`,
      );
      return;
    }
    setReviewOpen(true);
  };

  const cancelSession = () => {
    if (!session) return;
    cancel.mutate(session.id, {
      onSuccess: () => {
        toast.success("Opname dibatalkan");
        goBack();
      },
      onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal membatalkan opname"),
    });
  };

  if (detailLoading && !session) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Memuat sesi opname...</p>;
  }

  if (!session) {
    return (
      <>
        <PageHeader
          title="Pencatatan Opname"
          description="Sesi opname tidak ditemukan"
          actions={
            <Button variant="outline" className="rounded-xl" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" /> Daftar Sesi
            </Button>
          }
        />
        <Panel>
          <EmptyState
            title="Sesi tidak ditemukan"
            description="Sesi opname mungkin telah dihapus atau tautan tidak valid."
          />
        </Panel>
      </>
    );
  }

  const isDraft = session.status === "Draft";
  const blind = isDraft && session.blind_count === true && !revealed;
  const mutationsBusy = update.isPending || cancel.isPending;

  return (
    <>
      <PageHeader
        title={`Pencatatan Opname — ${session.no}`}
        description={`${session.warehouse ?? "—"} · ${formatDate(session.document_date)} · PIC ${session.pic ?? "—"} · ${uncounted} belum dicek${blind ? " · blind count aktif" : ""}`}
        actions={
          <Button variant="outline" className="rounded-xl" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" /> Daftar Sesi
          </Button>
        }
      />

      <Panel
        title="Pencatatan Fisik"
        description={`${formatNumber(lines.length)} baris · selisih ${totalVariance > 0 ? "+" : ""}${formatNumber(totalVariance)}`}
        actions={
          isDraft && canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              {blind && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={mutationsBusy}
                  onClick={() => setRevealed(true)}
                >
                  <Eye className="h-4 w-4" /> Tampilkan Sistem
                </Button>
              )}
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
                  className={`grid gap-3 rounded-xl border border-border p-3 ${
                    blind
                      ? "sm:grid-cols-[minmax(0,1fr)_auto]"
                      : "sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.name ?? "—"}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {l.sku ?? "—"} · satuan {l.unit ?? "—"} · Rak {l.from_rack ?? "—"} · Bin{" "}
                      {l.from_bin ?? "—"}
                    </p>
                  </div>
                  {!blind && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">Sistem</p>
                      <b>
                        {formatNumber(l.system_qty ?? 0)} {l.unit ?? ""}
                      </b>
                    </div>
                  )}
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
                  {!blind && (
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
                  )}
                </div>
              );
            })
          )}
        </div>
        {!isDraft && (
          <p className="mt-4 text-xs text-muted-foreground">
            Sesi {session.status === "Selesai" ? "telah selesai diposting" : "tidak lagi aktif"} —
            hanya sesi Draft yang dapat dicatat.
          </p>
        )}
      </Panel>

      <OpnameReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        session={session}
        lines={lines}
        records={records}
        onCompleted={goBack}
      />
    </>
  );
}
