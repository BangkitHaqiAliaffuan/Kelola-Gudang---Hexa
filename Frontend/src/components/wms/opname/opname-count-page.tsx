import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Barcode, ChevronLeft, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/wms/kit";
import { getAuthToken } from "@/lib/api";
import { OpnameReviewDialog } from "@/components/wms/opname/opname-review-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  useCancelStockDocument,
  useForceUnlockStockDocument,
  useHeartbeatStockDocument,
  useLockStockDocument,
  useStockDocument,
  useUnlockStockDocument,
  useUpdateStockDocument,
} from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { isApiError } from "@/lib/api";

export function OpnameCountPage({ docId }: { docId: number }) {
  const { hasModuleLevel, user } = useAuth();
  const canWrite = hasModuleLevel("Persediaan", "Tulis");
  const canForceUnlock = hasModuleLevel("Persediaan", "Kelola") || user?.role === "Auditor";
  const router = useRouter();

  const { data: detail, isLoading: detailLoading } = useStockDocument(docId);
  const update = useUpdateStockDocument();
  const cancel = useCancelStockDocument();

  const session = detail?.data ?? null;
  const lines = useMemo(() => detail?.data?.lines ?? [], [detail?.data]);

  const [scan, setScan] = useState("");
  const [records, setRecords] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        JSON.parse(window.localStorage.getItem(`kg-opname-revealed-${docId}`) || "{}")?.revealed ||
        false
      );
    } catch {
      return false;
    }
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const toggleRevealed = () => {
    setRevealed(true);
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(
          `kg-opname-revealed-${docId}`,
          JSON.stringify({ revealed: true }),
        );
    } catch {}
  };
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Lock eksklusif per dokumen (server-draft only)
  const lock = useLockStockDocument();
  const heartbeat = useHeartbeatStockDocument();
  const unlock = useUnlockStockDocument();
  const forceUnlock = useForceUnlockStockDocument();
  const [hasEditLock, setHasEditLock] = useState(false);
  const [lockBlockedBy, setLockBlockedBy] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");

  // guard hydrate: don't clobber typing, and don't reset blind reveal per autosave
  const prevLinesRef = useRef<number | null>(null);
  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    const isDocChange = prevLinesRef.current !== docId;
    prevLinesRef.current = docId;

    // Server truth — tidak ada draft lokal lagi
    const serverRecords = Object.fromEntries(
      lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
    );
    const hash = JSON.stringify(serverRecords);

    if (isDocChange) {
      prevServerHashRef.current = null;
      setRecords(serverRecords);
      try {
        if (typeof window !== "undefined") {
          const v = JSON.parse(window.localStorage.getItem(`kg-opname-revealed-${docId}`) || "{}")?.revealed;
          setRevealed(!!v);
        }
      } catch {
        setRevealed(false);
      }
      return;
    }

    const prevHash = prevServerHashRef.current;
    prevServerHashRef.current = hash;

    if (isSavingRef.current || update.isPending) return;
    if (!prevHash) return;

    const hasDirty = lines.some(
      (l) => (recordsRef.current[l.id] ?? "") !== (l.actual_qty != null ? String(l.actual_qty) : ""),
    );

    if (prevHash !== hash && hasDirty && lines.some((l) => l.actual_qty != null)) {
      toast.warning("Data diperbarui di perangkat lain — muat ulang untuk lihat?", {
        id: `opname-conflict-${docId}`,
        action: {
          label: "Muat ulang",
          onClick: () => {
            setRecords(serverRecords);
          },
        },
        duration: 8000,
      });
      return;
    }

    if (hasDirty) return;
    setRecords(serverRecords);
  }, [docId, lines, session?.status]);

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

  const buildLines = useCallback(
    () =>
      lines.map((l) => {
        const raw = (records[l.id] ?? "").trim();
        return {
          item_id: l.item_id,
          from_bin_id: l.from_bin_id ?? null,
          system_qty: l.system_qty,
          actual_qty: raw === "" ? null : Number(raw),
          unit_cost: l.unit_cost,
        };
      }),
    [lines, records],
  );

  const hasValidationError = useCallback(() => {
    const bl = buildLines();
    return bl.some(
      (l) => l.actual_qty != null && (!Number.isInteger(l.actual_qty) || l.actual_qty < 0),
    );
  }, [buildLines]);

  const goBack = () => router.navigate({ to: "/opname/$section", params: { section: "proses" } });

  // hybrid autosave: local per-huruf, server per jeda antar input (onBlur + 1.5s idle + keepalive)
  const lastSentRef = useRef<string | null>(null);
  const prevServerHashRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const silentSaveRef = useRef<() => void>(() => {});
  const isSavingRef = useRef(false);
  const needsResaveRef = useRef(false);

  const silentSave = useCallback(() => {
    if (!session || session.status !== "Draft" || !canWrite || !hasEditLock) return;
    if (!dirty) return;
    if (isSavingRef.current || update.isPending) {
      needsResaveRef.current = true;
      return;
    }
    if (hasValidationError()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const payload = buildLines();
    // Hash dari records (shape sama dengan serverRecords: line.id -> qty) untuk dedup yang konsisten
    const hash = JSON.stringify(records);
    if (lastSentRef.current === hash) return;
    isSavingRef.current = true;
    setAutoSaving(true);
    update.mutate(
      {
        id: session.id,
        payload: {
          document_date: session.document_date,
          pic: session.pic,
          lines: payload,
        },
      },
      {
        onSuccess: () => {
          lastSentRef.current = hash;
          setLastSavedAt(Date.now());
          setAutoSaving(false);
          isSavingRef.current = false;
          if (needsResaveRef.current) {
            needsResaveRef.current = false;
            // Schedule immediate flush for queued items
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => silentSaveRef.current(), 300);
          }
        },
        onError: () => {
          setAutoSaving(false);
          isSavingRef.current = false;
          needsResaveRef.current = false;
        },
      },
    );
  }, [session, canWrite, hasEditLock, dirty, update, hasValidationError, buildLines, records]);

  // keep ref fresh for keepalive flush without re-registering listeners
  useEffect(() => {
    silentSaveRef.current = silentSave;
  }, [silentSave]);

  const scheduleAutosave = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => silentSaveRef.current(), 1500);
  }, []);

  const flushAutosave = useCallback(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    silentSaveRef.current();
  }, []);

  // keepalive flush for tab close (beacon)
  const flushKeepalive = useCallback(() => {
    if (!session || session.status !== "Draft" || !dirty || !hasEditLock || hasValidationError()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const payload = buildLines();
    const hash = JSON.stringify(records);
    if (lastSentRef.current === hash) return;
    try {
      const token = getAuthToken();
      const url = `/api/persediaan/stock-documents/${session.id}`;
      const body = JSON.stringify({
        document_date: session.document_date,
        pic: session.pic,
        lines: payload,
      });
      // keepalive fetch survives pagehide/beforeunload
      fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "ngrok-skip-browser-warning": "true",
        },
        body,
        keepalive: true,
      } as RequestInit);
      // Jangan update lastSent di keepalive — fire-and-forget tanpa ack, biar next silentSave yang ack
      // keep local draft for safety; will be cleared on next successful silentSave
    } catch {
      // best effort
    }
  }, [session, dirty, hasValidationError, buildLines, records, hasEditLock]);

  // online/offline + visibility/pagehide listeners (stable, not per-keystroke)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "hidden") flushKeepalive();
    };
    const onOnline = () => {
      setIsOnline(true);
      toast.success("Kembali online — menyinkron draft...");
      silentSaveRef.current();
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning("Offline — perubahan belum bisa disimpan ke server");
    };
    const onBeforeUnload = () => flushKeepalive();
    const onPageHide = () => flushKeepalive();
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushKeepalive]);

  // Lock eksklusif per dokumen (server-draft only, 10 menit)
  useEffect(() => {
    if (!session || session.status !== "Draft" || !canWrite) return;
    if (session.is_locked_by_me) {
      setHasEditLock(true);
      setLockBlockedBy(null);
      return;
    }
    if (session.locked_by && !session.is_locked_by_me) {
      setHasEditLock(false);
      setLockBlockedBy(session.locked_by);
      return;
    }
    setLockLoading(true);
    lock.mutate(docId, {
      onSuccess: (data) => {
        if (data.data.is_locked_by_me) {
          setHasEditLock(true);
          setLockBlockedBy(null);
        }
        setLockLoading(false);
      },
      onError: (err) => {
        setLockLoading(false);
        if (isApiError(err) && err.status === 423) {
          const msg = err.message;
          const name = msg.includes("oleh")
            ? (msg.split("oleh")[1]?.trim().replace(/\.$/, "") ?? "User lain")
            : (session.locked_by ?? "User lain");
          setHasEditLock(false);
          setLockBlockedBy(name);
        }
      },
    });
  }, [session?.id, session?.status, canWrite, docId]);

  useEffect(() => {
    if (!hasEditLock || !session || session.status !== "Draft") return;
    const id = window.setInterval(() => {
      heartbeat.mutate(docId, {
        onError: (err) => {
          if (isApiError(err) && err.status === 423) {
            setHasEditLock(false);
            setLockBlockedBy("User lain");
            toast.error("Akses diambil alih");
          }
        },
      });
    }, 30000);
    return () => window.clearInterval(id);
  }, [hasEditLock, docId, session?.status]);

  useEffect(() => {
    if (!hasEditLock) return;
    const doUnlock = () => {
      const token = getAuthToken();
      fetch(`/api/persediaan/stock-documents/${docId}/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "ngrok-skip-browser-warning": "true",
        },
        keepalive: true,
      } as RequestInit);
    };
    window.addEventListener("beforeunload", doUnlock);
    window.addEventListener("pagehide", doUnlock);
    return () => {
      window.removeEventListener("beforeunload", doUnlock);
      window.removeEventListener("pagehide", doUnlock);
      unlock.mutate(docId);
    };
  }, [hasEditLock, docId]);

  const saveDraft = () => {
    if (!session) return;
    if (!hasEditLock) {
      toast.error("Tidak memiliki akses edit — ambil alih dulu");
      return;
    }
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
        onSuccess: () => {
          toast.success("Draft opname disimpan");
          setLastSavedAt(Date.now());
        },
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

      {lockBlockedBy && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Sedang diisi oleh {lockBlockedBy}. Halaman ini hanya dapat dilihat.
          </p>
          {canForceUnlock && (
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setForceOpen(true)}>
              Ambil alih paksa
            </Button>
          )}
        </div>
      )}
      {lockLoading && (
        <div className="mb-4">
          <Pill tone="neutral">Membuka akses edit...</Pill>
        </div>
      )}

      <Panel
        title="Pencatatan Fisik"
        description={`${formatNumber(lines.length)} baris · selisih ${totalVariance > 0 ? "+" : ""}${formatNumber(totalVariance)}${!isOnline ? " · offline — belum tersimpan" : autoSaving ? " · menyimpan..." : lastSavedAt ? ` · tersimpan ${new Date(lastSavedAt).toLocaleTimeString("id-ID")}` : ""}${hasEditLock ? " · akses edit aktif" : lockBlockedBy ? " · terkunci" : ""}`}
        actions={
          isDraft && canWrite && hasEditLock ? (
            <div className="flex flex-wrap items-center gap-2">
              {autoSaving && <Pill tone="neutral">Menyimpan...</Pill>}
              {!isOnline && <Pill tone="warning">Offline</Pill>}
              {blind && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={mutationsBusy}
                  onClick={toggleRevealed}
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
        {canWrite && isDraft && hasEditLock && (
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
                    {canWrite && isDraft && hasEditLock ? (
                      <Input
                        type="number"
                        min={0}
                        value={raw}
                        onChange={(e) => {
                          setRecords((prev) => ({ ...prev, [l.id]: e.target.value }));
                          scheduleAutosave();
                        }}
                        onBlur={flushAutosave}
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

      <Dialog open={forceOpen} onOpenChange={setForceOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Ambil alih paksa</DialogTitle>
            <DialogDescription>
              Dokumen sedang dikunci oleh {lockBlockedBy ?? "user lain"}. Ambil alih akan mengalihkan akses edit ke Anda. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Alasan (opsional)</p>
            <Input
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              placeholder="Misal: pemilik lock terputus"
              className="rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setForceOpen(false)}>
              Batal
            </Button>
            <Button
              className="rounded-lg"
              disabled={forceUnlock.isPending}
              onClick={() => {
                forceUnlock.mutate(
                  { id: docId, ...(forceReason ? { reason: forceReason } : {}) },
                  {
                    onSuccess: () => {
                      toast.success("Akses berhasil diambil alih");
                      setHasEditLock(true);
                      setLockBlockedBy(null);
                      setForceOpen(false);
                      setForceReason("");
                    },
                    onError: (err) => toast.error(isApiError(err) ? err.message : "Gagal ambil alih"),
                  },
                );
              }}
            >
              {forceUnlock.isPending ? "Memproses..." : "Ambil alih"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
