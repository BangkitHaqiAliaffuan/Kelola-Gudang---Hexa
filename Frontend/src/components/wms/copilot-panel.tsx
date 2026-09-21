import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { Maximize2, Sparkles, X } from "lucide-react";

import { useCopilot } from "@/hooks/use-copilot";
import { AiChatView } from "./ai-chat-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  COPILOT_DESKTOP_QUERY,
  DRAG_THRESHOLD_PX,
  clampGeometry,
  clearGeometry,
  loadGeometry,
  saveGeometry,
  type PanelGeometry,
} from "@/lib/copilot-geometry";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Re-export kompatibel (dipakai copilot-panel.spec + konsumen lama).
export { FormattedMessage } from "./ai-chat-view";

/** Durasi animasi keluar (ms) — samakan dengan `duration-150` di bawah. */
const EXIT_MS = 150;

/**
 * Pop-up AI Copilot (F8.6) — panel mengambang NON-modal (kanan-bawah) yang
 * bisa dibuka/ditutup. Non-modal supaya user tetap melihat halaman sambil
 * mengonfirmasi usulan (HITL). Usulan aksi TIDAK dieksekusi sampai user klik
 * Konfirmasi.
 */
export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copilot = useCopilot();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  // Geometri eksplisit (null = layout default kanan-bawah). Hanya dipakai desktop.
  const [geom, setGeom] = useState<PanelGeometry | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(COPILOT_DESKTOP_QUERY).matches,
  );
  // Konfirmasi hapus riwayat chat (tombol Bersihkan tidak langsung menghapus).
  const [confirmClear, setConfirmClear] = useState(false);

  // Tutup beranimasi: pasang class exit dulu, onClose dipanggil setelahnya.
  const [leaving, setLeaving] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (leaving) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onClose();
      return;
    }
    setLeaving(true);
    closeTimerRef.current = window.setTimeout(onClose, EXIT_MS);
  }, [leaving, onClose]);

  type Gesture = {
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    mode: "move" | "resize";
    moved: boolean;
    final: PanelGeometry;
  };
  const gestureRef = useRef<Gesture | null>(null);

  // Bersihkan timer keluar bila panel unmount di tengah animasi (mis. logout).
  useEffect(
    () => () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Breakpoint desktop + restore geometri tersimpan (mount).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(COPILOT_DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    const saved = loadGeometry();
    if (saved) setGeom(clampGeometry(saved, window.innerWidth, window.innerHeight));
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Jepit ulang saat viewport berubah (rotasi/zoom/resize window).
  useEffect(() => {
    if (typeof window === "undefined" || !geom) return;
    const onResize = () => {
      const c = clampGeometry(geom, window.innerWidth, window.innerHeight);
      if (c.x !== geom.x || c.y !== geom.y || c.w !== geom.w || c.h !== geom.h) {
        setGeom(c);
        saveGeometry(c);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [geom]);

  const beginGesture = (e: ReactPointerEvent<HTMLDivElement>, mode: "move" | "resize") => {
    if (!isDesktop) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const base: PanelGeometry = geom ?? {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    };
    // Pin ke eksplisit sejak gesture dimulai agar class right/bottom/max-h lepas.
    if (!geom) setGeom(base);
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: base.x,
      origY: base.y,
      origW: base.w,
      origH: base.h,
      mode,
      moved: false,
      final: base,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* abaikan — pointer sudah lepas */
    }
    document.body.style.userSelect = "none";
  };

  const moveGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    const el = panelRef.current;
    if (!g || !el || e.pointerId !== g.pointerId || typeof window === "undefined") return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    g.moved = true;
    const raw: PanelGeometry =
      g.mode === "move"
        ? { x: g.origX + dx, y: g.origY + dy, w: g.origW, h: g.origH }
        : { x: g.origX, y: g.origY, w: g.origW + dx, h: g.origH + dy };
    const c = clampGeometry(raw, window.innerWidth, window.innerHeight);
    g.final = c;
    // Tulis DOM langsung (tanpa re-render per-frame); commit saat pointerup.
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
    el.style.width = `${c.w}px`;
    el.style.height = `${c.h}px`;
  };

  const finishGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gestureRef.current = null;
    document.body.style.userSelect = "";
    if (g.moved) {
      setGeom(g.final);
      saveGeometry(g.final);
    }
  };

  const resetGeometry = () => {
    setGeom(null);
    clearGeometry();
  };

  // Sinkronkan prop open → state hook (hook sumber kebenaran tunggal).
  useEffect(() => {
    copilot.setOpen(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc menutup panel (aksesibilitas) — lewat animasi keluar juga.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  const busy = copilot.chat.isPending;
  const status = copilot.status.data;
  const disabled = status !== undefined && (!status.enabled || !status.available);

  return (
    <>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Asisten AI KelolaGudang"
        className={cn(
          "fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[400px]",
          geom && isDesktop && "sm:right-auto sm:bottom-auto sm:max-h-none",
          // Muncul pop dari kanan-bawah; hilang menyusut ke arah yang sama.
          leaving
            ? "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95 motion-safe:slide-out-to-bottom-4 motion-safe:duration-150"
            : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 motion-safe:origin-bottom-right",
        )}
        style={
          geom && isDesktop
            ? { left: geom.x, top: geom.y, width: geom.w, height: geom.h }
            : undefined
        }
      >
        {/* Header — juga handle drag di desktop (klik ganda = reset). */}
        <div
          className={cn(
            "flex items-center gap-2 border-b border-border bg-card px-3 py-2.5 select-none",
            isDesktop && "cursor-move touch-none",
          )}
          onPointerDown={(e) => beginGesture(e, "move")}
          onPointerMove={moveGesture}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
          onDoubleClick={resetGeometry}
          title={isDesktop ? "Geser untuk memindah · klik ganda untuk reset" : undefined}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Asisten AI</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {disabled ? "Nonaktif" : busy ? "mengetik…" : `siap · ${status?.provider ?? "ai"}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setConfirmClear(true)}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={
              busy ||
              copilot.execute.isPending ||
              (copilot.turns.length === 0 && copilot.pending.length === 0)
            }
            aria-label="Bersihkan"
          >
            <X className="hidden" />
            <span className="text-[11px]">Bersihkan</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => {
              onClose();
              navigate({ to: "/ai-assistant" });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Layar penuh"
            title="Buka halaman penuh"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={requestClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <AiChatView copilot={copilot} variant="panel" />

        {/* Handle resize sudut kanan-bawah (desktop saja). */}
        {isDesktop && (
          <div
            className="absolute right-0 bottom-0 h-5 w-5 cursor-nwse-resize touch-none"
            title="Tarik untuk mengubah ukuran"
            onPointerDown={(e) => beginGesture(e, "resize")}
            onPointerMove={moveGesture}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
          >
            <div className="absolute right-1 bottom-1 h-2.5 w-2.5 rounded-br-md border-r-2 border-b-2 border-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Konfirmasi hapus riwayat — penghapusan tidak bisa dibatalkan. */}
      <AlertDialog open={confirmClear} onOpenChange={(o) => !o && setConfirmClear(false)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus riwayat chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Riwayat chat dan usulan yang belum dikonfirmasi akan dihapus dan tidak dapat
              dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                copilot.clear();
                setConfirmClear(false);
              }}
            >
              Ya, hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
