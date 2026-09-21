import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Check, Minus, Pencil, Plus, Send, Sparkles, X } from "lucide-react";

import { useCopilot } from "@/hooks/use-copilot";
import type { AiProposal, AiProposalPreview } from "@/lib/ai-api";
import { AiResultTables } from "./ai-result-table";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Saran cepat — diklik langsung mengirim perintah (tanpa mengetik). */
const QUICK_PROMPTS = [
  "📦 Cek barang stok minimum",
  "📊 Barang paling sering keluar bulan ini",
  "📥 Buat draft penerimaan barang",
  "📤 Buat draft pengeluaran barang",
];

/** Sapaan pembuka — isi diselaraskan dengan tool backend (lihat ToolRegistry). */
const WELCOME_FEATURES = [
  "🔍 Cari barang & cek stok per gudang (nama, SKU, barcode)",
  "📊 Analisis data — stok minimum, barang sering keluar, tren",
  "📝 Buatkan draft dokumen masuk, keluar, atau transfer gudang",
];
const WELCOME_NOTES = [
  "✅ Aksi penting selalu minta konfirmasi dulu — hasilnya selalu Draft",
  "🔒 Saya hanya bisa dalam batas hak akses & gudang Anda",
];

/** Flag localStorage: sapaan lengkap hanya di pembukaan pertama. */
const WELCOME_FLAG_KEY = "kg-ai-welcomed";

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
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Geometri eksplisit (null = layout default kanan-bawah). Hanya dipakai desktop.
  const [geom, setGeom] = useState<PanelGeometry | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(COPILOT_DESKTOP_QUERY).matches,
  );
  // Konfirmasi hapus riwayat chat (tombol Bersihkan tidak langsung menghapus).
  const [confirmClear, setConfirmClear] = useState(false);
  // Sapaan lengkap hanya di pembukaan pertama; sesudahnya versi ringkas.
  const [showFullWelcome, setShowFullWelcome] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(WELCOME_FLAG_KEY) == null;
    } catch {
      return true;
    }
  });
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

  // Sapaan lengkap cukup sekali — tandai sudah pernah dibuka (mount).
  // Initializer di atas sudah membaca flag; effect ini hanya menulisnya +
  // backstop bila initializer default (SSR/mode privat).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(WELCOME_FLAG_KEY) == null) {
        window.localStorage.setItem(WELCOME_FLAG_KEY, "1");
        return; // pembukaan pertama — biarkan sapaan lengkap tampil
      }
    } catch {
      return;
    }
    setShowFullWelcome(false);
  }, []);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [copilot.turns, copilot.pending, copilot.chat.isPending]);

  if (!open) return null;

  const busy = copilot.chat.isPending;
  const status = copilot.status.data;
  const disabled = status !== undefined && (!status.enabled || !status.available);

  const submit = () => {
    const text = draft.trim();
    if (text === "" || busy) return;
    copilot.send(text);
    setDraft("");
  };

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
            onClick={requestClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Percakapan */}
        <div
          ref={scrollRef}
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
        >
          {copilot.turns.length === 0 && !copilot.chat.isPending && (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              {showFullWelcome ? (
                <>
                  <p className="mb-1 text-sm font-semibold text-foreground">
                    Halo! Saya Asisten AI KelolaGudang 👋
                  </p>
                  <p className="mb-2">
                    Saya membantu pekerjaan gudang lewat percakapan — tanya data atau minta
                    dibuatkan draft dokumen.
                  </p>
                  <p className="mb-1 font-medium text-foreground">Saya bisa bantu:</p>
                  <ul className="mb-2 list-disc space-y-0.5 pl-4">
                    {WELCOME_FEATURES.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <p className="mb-1 font-medium text-foreground">Perlu Anda tahu:</p>
                  <ul className="mb-2 list-disc space-y-0.5 pl-4">
                    {WELCOME_NOTES.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  {disabled && (
                    <p className="mb-2 font-medium text-amber-600">
                      AI sedang nonaktif — hubungi administrator untuk mengaktifkan.
                    </p>
                  )}
                </>
              ) : (
                <p className="mb-2 font-medium text-foreground">
                  Halo! Ada yang bisa saya bantu? 👋
                </p>
              )}
              <p className="mb-2 font-medium text-foreground">
                Contoh perintah (klik untuk kirim):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => copilot.send(q)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {copilot.turns.map((t) => (
            <div
              key={t.id}
              className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm",
                  t.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                  // Turn asisten yang membawa tabel perlu lebar lebih agar tabel
                  // terbaca (max-w penuh panel, sedikit inset).
                  t.role === "assistant" && (t.toolResults?.length ?? 0) > 0 && "w-full max-w-full",
                )}
              >
                <FormattedMessage text={t.text} />
                {t.role === "assistant" && (t.toolResults?.length ?? 0) > 0 && (
                  <AiResultTables results={t.toolResults ?? []} />
                )}
                {t.role === "user" && t.status === "sending" && (
                  <p className="mt-0.5 animate-pulse text-right text-[10px] opacity-70">
                    Mengirim…
                  </p>
                )}
                {t.role === "user" && t.status === "failed" && (
                  <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px]">
                    <span className="opacity-70">Gagal terkirim</span>
                    <button
                      type="button"
                      onClick={() => copilot.retry(t.id)}
                      className="font-semibold underline underline-offset-2"
                    >
                      Kirim ulang
                    </button>
                  </p>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start" aria-label="AI sedang mengetik">
              <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-3.5 py-2.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Kartu Usulan (HITL) */}
          {copilot.pending.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onConfirm={(corrections) =>
                copilot.execute.mutate(corrections ? { id: p.id, corrections } : { id: p.id })
              }
              onReject={() => copilot.reject.mutate(p.id)}
              busy={copilot.execute.isPending}
            />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border p-2.5">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={disabled ? "AI nonaktif" : "Tanya atau perintahkan…"}
              disabled={disabled || busy}
              className="min-h-[40px] max-h-32 resize-none rounded-xl"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={submit}
              disabled={disabled || busy || draft.trim() === ""}
              aria-label="Kirim"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            AI dapat keliru. Periksa usulan sebelum konfirmasi — aksi dibuat sebagai <b>Draft</b>.
          </p>
        </div>
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

/**
 * Render pesan AI terformat (bold, bullet, numbering) sebagai React elements.
 *
 * KEAMANAN: tidak memakai dangerouslySetInnerHTML — output model adalah input
 * tak tepercaya (bisa membawa markup dari injeksi via data master), jadi HTML
 * mentah TIDAK pernah dirender. Hanya subset markdown aman yang didukung.
 */
export function FormattedMessage({ text }: { text: string }) {
  return <>{formatBlocks(text)}</>;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={`${keyPrefix}-${i}`}>{m[1] ?? part}</strong>;
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function formatBlocks(text: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let key = 0;
  let i = 0;

  const flushList = (items: string[], ordered: boolean, startKey: number) => {
    if (items.length === 0) return;
    const List = ordered ? "ol" : "ul";
    blocks.push(
      <List
        key={startKey}
        className={ordered ? "list-decimal space-y-0.5 pl-4" : "list-disc space-y-0.5 pl-4"}
      >
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `${startKey}-${idx}`)}</li>
        ))}
      </List>,
    );
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Blok kode ``` → teks polos (tidak dieksekusi, tidak diformat).
    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "```") {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // lewati penutup
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg bg-background/60 p-1.5 font-mono text-[12px]"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    // Kelompokkan bullet/numbering berurutan dalam satu list.
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet?.[1] !== undefined || numbered?.[1] !== undefined) {
      const ordered = numbered?.[1] !== undefined;
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(cur) : /^\s*[-*]\s+(.*)$/.exec(cur);
        if (m?.[1] === undefined) break;
        items.push(m[1]);
        i++;
      }
      const k = key++;
      flushList(items, ordered, k);
      continue;
    }

    if (trimmed === "") {
      i++;
      continue;
    }
    blocks.push(<p key={key++}>{renderInline(trimmed, `p-${key}`)}</p>);
    i++;
  }

  return blocks.length > 0 ? blocks : [<span key="empty">{text}</span>];
}

/** Baris dokumen dari payload (divalidasi runtime — bukan asumsi bentuk). */
type PayloadLine = { item_id: number; qty: number };

function payloadLines(payload: Record<string, unknown>): PayloadLine[] {
  const raw = payload["lines"];
  if (!Array.isArray(raw)) return [];
  const out: PayloadLine[] = [];
  for (const l of raw) {
    if (typeof l !== "object" || l === null) continue;
    const rec = l as Record<string, unknown>;
    if (typeof rec["item_id"] !== "number" || typeof rec["qty"] !== "number") continue;
    out.push({ item_id: rec["item_id"], qty: rec["qty"] });
  }
  return out;
}

function strField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function typeBadgeClass(type: string): string {
  if (type === "Penerimaan")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (type === "Pengeluaran")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (type === "Transfer Gudang")
    return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
  return "bg-primary/10 text-primary";
}

/**
 * Kartu satu usulan aksi (Zero-JSON UI): badge tipe, info gudang/rekanan,
 * daftar item (nama+SKU), dan tombol Konfirmasi / Koreksi Visual / Batalkan.
 * Mode koreksi = form interaktif (stepper qty, input teks) — tanpa JSON.
 */
function ProposalCard({
  proposal,
  onConfirm,
  onReject,
  busy,
}: {
  proposal: AiProposal;
  onConfirm: (corrections?: Record<string, unknown>) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const payload = proposal.payload;
  const rawPreview = payload["_preview"];
  const preview: AiProposalPreview | null =
    typeof rawPreview === "object" && rawPreview !== null
      ? (rawPreview as AiProposalPreview)
      : null;
  const lines = payloadLines(payload);
  const previewLines = preview?.lines ?? [];
  const type = strField(payload["type"]) || "Dokumen Stok";
  const partner = strField(payload["partner"]);
  const note = strField(payload["note"]);
  const referenceNo = strField(payload["reference_no"]);
  const warehouseName = preview?.warehouse_name ?? null;
  const destName = preview?.destination_warehouse_name ?? null;

  const [editing, setEditing] = useState(false);
  const [editPartner, setEditPartner] = useState(partner);
  const [editNote, setEditNote] = useState(note);
  const [editQtys, setEditQtys] = useState<number[]>(() => lines.map((l) => l.qty));
  const [err, setErr] = useState<string | null>(null);

  const setQty = (idx: number, qty: number) => {
    setEditQtys((q) => q.map((v, j) => (j === idx ? qty : v)));
  };

  const confirm = () => {
    if (!editing) {
      onConfirm();
      return;
    }
    if (editQtys.some((q) => !Number.isInteger(q) || q < 1)) {
      setErr("Kuantitas tiap baris minimal 1.");
      return;
    }
    setErr(null);
    // Koreksi mengganti top-level payload (shallow merge di server):
    // array lines harus dikirim UTUH (bukan patch per-baris).
    onConfirm({
      partner: editPartner,
      note: editNote,
      lines: lines.map((l, idx) => ({ item_id: l.item_id, qty: editQtys[idx] ?? l.qty })),
    });
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            typeBadgeClass(type),
          )}
        >
          {type}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">Menunggu konfirmasi</span>
        {proposal.risk !== "low" && (
          <span className="text-[10px] font-medium text-amber-600">risiko: {proposal.risk}</span>
        )}
      </div>
      <p className="text-sm font-medium">{proposal.summary}</p>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {warehouseName && (
          <p>
            Gudang: <span className="font-medium text-foreground">{warehouseName}</span>
          </p>
        )}
        {destName && (
          <p>
            Tujuan: <span className="font-medium text-foreground">{destName}</span>
          </p>
        )}
        {partner && (
          <p>
            Rekanan: <span className="font-medium text-foreground">{partner}</span>
          </p>
        )}
        {referenceNo && <p>Referensi: {referenceNo}</p>}
      </div>

      {lines.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {lines.map((l, idx) => {
            const pv = previewLines[idx];
            const name = pv?.item_name ?? `Barang #${l.item_id}`;
            const sku = pv?.sku ? ` (${pv.sku})` : "";
            const unit = pv?.unit ? ` ${pv.unit}` : "";
            return (
              <li
                key={`${l.item_id}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {name}
                    <span className="font-normal text-muted-foreground">{sku}</span>
                  </span>
                </span>
                {editing ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 rounded-lg"
                      aria-label="Kurangi"
                      onClick={() => setQty(idx, Math.max(1, (editQtys[idx] ?? l.qty) - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={editQtys[idx] ?? l.qty}
                      onChange={(e) => setQty(idx, Number(e.target.value))}
                      className="h-6 w-14 rounded-lg px-1 text-center text-xs"
                      aria-label={`Kuantitas ${name}`}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 rounded-lg"
                      aria-label="Tambah"
                      onClick={() => setQty(idx, (editQtys[idx] ?? l.qty) + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-muted-foreground">{unit.trim()}</span>
                  </span>
                ) : (
                  <span className="shrink-0 font-semibold text-foreground">
                    {l.qty}
                    {unit}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <div className="mt-2 space-y-1.5">
          <Input
            value={editPartner}
            onChange={(e) => setEditPartner(e.target.value)}
            placeholder="Rekanan (supplier/customer)"
            className="h-8 rounded-lg text-xs"
            aria-label="Rekanan"
          />
          <Input
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Catatan"
            className="h-8 rounded-lg text-xs"
            aria-label="Catatan"
          />
        </div>
      )}
      {editing && err && <p className="mt-1 text-xs text-destructive">{err}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" className="rounded-lg" onClick={confirm} disabled={busy}>
          <Check className="h-3.5 w-3.5" /> {editing ? "Terapkan Koreksi" : "Konfirmasi Buat Draft"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
        >
          <Pencil className="h-3.5 w-3.5" /> {editing ? "Batal koreksi" : "Koreksi"}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" onClick={onReject} disabled={busy}>
          Batalkan
        </Button>
      </div>
    </div>
  );
}
