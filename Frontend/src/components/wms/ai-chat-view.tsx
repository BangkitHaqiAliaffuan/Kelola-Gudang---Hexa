import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  Boxes,
  Check,
  Copy,
  FileText,
  Minus,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Bot,
  TrendingUp,
  TriangleAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { useCopilot, type ChatTurn } from "@/hooks/use-copilot";
import type { AiProposal, AiProposalPreview } from "@/lib/ai-api";
import { AiResultTables } from "./ai-result-table";
import { AiTypewriter } from "./ai-typewriter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Flag localStorage: sapaan lengkap hanya di pembukaan pertama. */
const WELCOME_FLAG_KEY = "kg-ai-welcomed";

/** Saran cepat — diklik langsung mengirim perintah (tanpa mengetik). */
export const QUICK_PROMPTS = [
  "Cek barang stok minimum",
  "Barang paling sering keluar bulan ini",
  "Buat draft penerimaan barang",
  "Buat draft pengeluaran barang",
];

/** Sapaan pembuka — isi diselaraskan dengan tool backend (lihat ToolRegistry). */
export const WELCOME_FEATURES = [
  "Cari barang & cek stok per gudang (nama, SKU, barcode)",
  "Analisis data — stok minimum, barang sering keluar, tren",
  "Buatkan draft dokumen masuk, keluar, atau transfer gudang",
];
export const WELCOME_NOTES = [
  "Aksi penting selalu minta konfirmasi dulu — hasilnya selalu Draft",
  "Saya hanya bisa dalam batas hak akses & gudang Anda",
];

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

/** Baris tabel markdown: ada "|" sebagai pemisah sel (bukan sekadar diawali). */
function looksLikeTableRow(line: string): boolean {
  return line.replace(/^\||\|$/g, "").includes("|");
}

/** Pisahkan sel tabel markdown; buang pipe tepi, rapikan spasi. */
function splitTableRow(line: string): string[] {
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
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

    // Garis horizontal: --- / *** / ___ (minimal 3).
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-2 border-border" />);
      i++;
      continue;
    }

    // Heading: #, ##, ###, #### → h3/h4 (kita mulai dari h3 agar tidak
    // menyaingi judul halaman; # dan ## disamakan ke h3).
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading?.[2] !== undefined) {
      const level = (heading[1] ?? "#").length;
      const content = heading[2];
      const cls =
        level <= 2
          ? "mt-2 mb-1 text-sm font-semibold text-foreground"
          : "mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
      blocks.push(
        level <= 2 ? (
          <h3 key={key++} className={cls}>
            {renderInline(content, `h${key}`)}
          </h3>
        ) : (
          <h4 key={key++} className={cls}>
            {renderInline(content, `h${key}`)}
          </h4>
        ),
      );
      i++;
      continue;
    }

    // Blockquote: satu atau beberapa baris berawalan ">".
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        buf.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      const k = key++;
      blocks.push(
        <blockquote
          key={k}
          className="my-1 border-l-2 border-primary/40 pl-2 text-[13px] text-muted-foreground italic"
        >
          {buf.map((b, idx) => (
            <p key={idx}>{renderInline(b, `q-${k}-${idx}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Tabel markdown: baris header berawalan "|" diikuti separator |---|.
    if (trimmed.startsWith("|") && looksLikeTableRow(trimmed)) {
      const header = splitTableRow(trimmed);
      const sepLine = (lines[i + 1] ?? "").trim();
      const isSeparator = /^\|?[\s:|-]+\|?$/.test(sepLine) && sepLine.includes("-");
      if (header.length > 0 && isSeparator) {
        i += 2; // lewati header + separator
        const rows: string[][] = [];
        while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
          rows.push(splitTableRow((lines[i] ?? "").trim()));
          i++;
        }
        const k = key++;
        blocks.push(
          <div key={k} className="my-1.5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {header.map((h, idx) => (
                    <th
                      key={idx}
                      className="whitespace-nowrap border-b border-border bg-muted px-2 py-1 text-left font-semibold text-muted-foreground"
                    >
                      {renderInline(h, `th-${k}-${idx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-border/60 last:border-0">
                    {header.map((_, ci) => (
                      <td key={ci} className="whitespace-nowrap px-2 py-1 align-top">
                        {renderInline(r[ci] ?? "", `td-${k}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
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

export const CATEGORIZED_PROMPTS = [
  {
    category: "Stok & Ketersediaan",
    icon: Boxes,
    color: "text-blue-500 dark:text-blue-400 bg-blue-500/10",
    prompts: [
      "Cek barang stok minimum",
      "Cari stok barang SKU atau nama",
      "Tampilkan daftar gudang aktif",
    ],
  },
  {
    category: "Analitik & Performa",
    icon: TrendingUp,
    color: "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10",
    prompts: [
      "Barang paling sering keluar bulan ini",
      "Analisis tren pengeluaran barang",
      "Barang dead stock 30 hari terakhir",
    ],
  },
  {
    category: "Otomasi Dokumen",
    icon: FileText,
    color: "text-purple-500 dark:text-purple-400 bg-purple-500/10",
    prompts: [
      "Buat draft penerimaan barang",
      "Buat draft pengeluaran barang",
      "Buat draft transfer antar gudang",
    ],
  },
];

/**
 * Badan chat AI bersama (F8.8) — dipakai panel mengambang (variant "panel")
 * dan halaman penuh (variant "page"). State percakapan milik hook
 * useCopilot (persist sessionStorage per-tab); komponen ini stateless
 * selain draft input + scroll + flag sapaan.
 */
export function AiChatView({
  copilot,
  variant,
}: {
  copilot: ReturnType<typeof useCopilot>;
  variant: "panel" | "page";
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  // Lacak turn ID yang sudah selesai dianimasikan agar riwayat tidak re-animate
  const animatedTurnIdsRef = useRef<Set<number>>(new Set(copilot.turns.map((t) => t.id)));
  // Sinkronisasi hidrasi: riwayat sessionStorage tiba async setelah mount
  // (useCopilot memuatnya di useEffect); tanpa ini pesan lama terdeteksi baru
  // dan mengetik ulang saat refresh. State memaksa render ulang agar flag
  // animasi terkoreksi.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated && copilot.turns.length > 0 && !copilot.chat.isPending) {
      copilot.turns.forEach((t) => animatedTurnIdsRef.current.add(t.id));
      setHydrated(true);
    }
  }, [copilot.turns, copilot.chat.isPending, hydrated]);

  const [showFullWelcome, setShowFullWelcome] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(WELCOME_FLAG_KEY) == null;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(WELCOME_FLAG_KEY) == null) {
        window.localStorage.setItem(WELCOME_FLAG_KEY, "1");
        return;
      }
    } catch {
      return;
    }
    setShowFullWelcome(false);
  }, []);

  // Ambang "dianggap sudah di bawah" — samakan dengan handleScroll agar
  // tombol "Ke pesan terbaru" tampil/hilang konsisten.
  const SCROLL_UP_THRESHOLD = 150;
  // Toleransi sub-piksel agar posisi yang praktisnya di bawah tidak memicu
  // scroll + guard sia-sia.
  const AT_BOTTOM_EPS = 2;

  // Guard scroll programatik: event scroll di tengah animasi smooth tidak
  // boleh menyetel ulang isScrolledUp (tombol berkedip + auto-scroll macet).
  const isAutoScrollingRef = useRef(false);
  const autoScrollTimerRef = useRef<number | null>(null);
  const scrollEndHandlerRef = useRef<(() => void) | null>(null);

  const distFromBottom = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  };

  // Menutup scroll programatik: matikan guard lalu ukur ulang posisi nyata.
  // Tanpa pengukuran ulang ini, event scroll yang ditelan guard membuat
  // isScrolledUp basi `true` — tombol "Ke pesan terbaru" nempel walau sudah
  // di bawah (atau setelah Bersihkan Chat / ganti sesi).
  const settleAutoScroll = () => {
    if (autoScrollTimerRef.current !== null) {
      window.clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    const el = scrollRef.current;
    if (el && scrollEndHandlerRef.current) {
      el.removeEventListener("scrollend", scrollEndHandlerRef.current);
      scrollEndHandlerRef.current = null;
    }
    isAutoScrollingRef.current = false;
    if (scrollRef.current) {
      setIsScrolledUp(distFromBottom() > SCROLL_UP_THRESHOLD);
    }
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    // Sudah di bawah: jangan scroll, jangan pasang guard — guard sia-sia
    // menelan scroll manual user (mis. tiap tick typewriter saat streaming).
    if (distFromBottom() <= AT_BOTTOM_EPS) return;
    isAutoScrollingRef.current = true;
    if (autoScrollTimerRef.current !== null) window.clearTimeout(autoScrollTimerRef.current);
    if (scrollEndHandlerRef.current) {
      el.removeEventListener("scrollend", scrollEndHandlerRef.current);
      scrollEndHandlerRef.current = null;
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    // Penutup presisi: scrollend (didukung Chrome/FF/Safari baru). Fallback
    // timer untuk browser lama — siapa pun duluan, idempoten via settle.
    if ("onscrollend" in el) {
      const onEnd = () => settleAutoScroll();
      scrollEndHandlerRef.current = onEnd;
      el.addEventListener("scrollend", onEnd, { once: true });
    }
    // Safari smooth-scroll ~500ms; beri jeda sebelum dengar scroll user lagi.
    autoScrollTimerRef.current = window.setTimeout(() => settleAutoScroll(), smooth ? 600 : 100);
  };

  useEffect(
    () => () => {
      if (autoScrollTimerRef.current !== null) window.clearTimeout(autoScrollTimerRef.current);
      const el = scrollRef.current;
      if (el && scrollEndHandlerRef.current) {
        el.removeEventListener("scrollend", scrollEndHandlerRef.current);
      }
      scrollEndHandlerRef.current = null;
    },
    [],
  );

  const handleScroll = () => {
    if (isAutoScrollingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    setIsScrolledUp(distFromBottom() > SCROLL_UP_THRESHOLD);
  };

  // Resync pasif: konten bisa menyusut tanpa event scroll (Bersihkan Chat,
  // ganti sesi, potong 100-turn) — flag basi `true` harus dibersihkan.
  // Hanya boleh mengeset false (konten muat = pasti di bawah); transisi ke
  // true tetap milik event scroll manual user.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof window === "undefined") return;
    const clearIfFits = () => {
      const target = scrollRef.current;
      if (!target || isAutoScrollingRef.current) return;
      if (target.scrollHeight - target.clientHeight <= SCROLL_UP_THRESHOLD) {
        setIsScrolledUp(false);
      }
    };
    const raf = window.requestAnimationFrame(clearIfFits);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(clearIfFits);
      observer.observe(el);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [copilot.turns.length]);

  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom(true);
    }
  }, [copilot.turns, copilot.pending, copilot.chat.isPending, isScrolledUp]);

  const handleTypingTick = () => {
    if (!isScrolledUp) {
      scrollToBottom(false);
    }
  };

  const legacyCopy = (text: string): boolean => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopy = async (id: number, text: string) => {
    let ok = false;
    // Jalur modern butuh secure-context + gesture + fokus; kegagalan sunyi
    // tidak boleh menampilkan status "Disalin".
    if (
      typeof navigator !== "undefined" &&
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof navigator.clipboard?.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = legacyCopy(text);
      }
    } else if (typeof document !== "undefined") {
      ok = legacyCopy(text);
    }
    if (ok) {
      setCopiedId(id);
      toast.success("Teks disalin ke clipboard.");
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.error("Gagal menyalin — silakan blok lalu salin manual.");
    }
  };

  const busy = copilot.chat.isPending;
  const status = copilot.status.data;
  const disabled = status !== undefined && (!status.enabled || !status.available);

  const submit = () => {
    const text = draft.trim();
    if (text === "" || busy) return;
    copilot.send(text);
    setDraft("");
  };

  // Batasi DOM sesi panjang: hanya 100 turn terakhir yang dirender agar
  // sesi marathon tidak membengkakkan DOM; riwayat penuh tetap di state.
  const MAX_RENDER_TURNS = 100;
  const visibleTurns = copilot.turns.slice(-MAX_RENDER_TURNS);
  const hiddenTurnCount = copilot.turns.length - visibleTurns.length;

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        aria-live="polite"
        className={
          variant === "page"
            ? "grid min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-1 py-1"
            : "flex-1 space-y-3 overflow-y-auto px-3 py-3"
        }
      >
        {copilot.turns.length === 0 && !copilot.chat.isPending && (
          <>
            {variant === "page" ? (
              <div className="space-y-6 py-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/25">
                    <Bot className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">
                    Asisten AI KelolaGudang
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground sm:text-sm">
                    Tanya stok, minta analitik, atau buat draft dokumen mutasi — setiap eksekusi
                    selalu butuh konfirmasi Anda.
                  </p>
                  {disabled && (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      <span>
                        AI sedang nonaktif — hubungi administrator untuk mengaktifkan fitur ini.
                      </span>
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {CATEGORIZED_PROMPTS.map((cat) => (
                    <div
                      key={cat.category}
                      className="flex flex-col rounded-xl border border-border/70 bg-card p-3 shadow-2xs transition-colors hover:border-primary/40"
                    >
                      <div className="mb-2.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-lg text-xs",
                            cat.color,
                          )}
                        >
                          <cat.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {cat.category}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        {cat.prompts.map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={disabled || busy}
                            onClick={() => copilot.send(p)}
                            className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-left text-[11px] text-foreground transition-colors hover:border-primary hover:bg-primary-soft/50 hover:text-primary disabled:opacity-50"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-2.5 text-center text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span>
                      Semua usulan mutasi dibuat sebagai{" "}
                      <strong className="font-semibold text-foreground">Draft</strong> dan
                      memerlukan konfirmasi Anda sebelum dieksekusi.
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                {showFullWelcome ? (
                  <>
                    <p className="mb-1 text-sm font-semibold text-foreground">
                      Halo! Saya Asisten AI KelolaGudang
                    </p>
                    <p className="mb-2">
                      Tanya stok, minta analitik, atau minta dibuatkan draft dokumen — setiap
                      eksekusi selalu butuh konfirmasi Anda.
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
                    Halo! Ada yang bisa saya bantu? Tanya stok, analitik, atau draft dokumen.
                  </p>
                )}
                <p className="mb-2 font-medium text-foreground">
                  Contoh perintah (klik untuk kirim):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <Button
                      key={q}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || busy}
                      onClick={() => copilot.send(q)}
                      className="h-7 rounded-lg text-[11px]"
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {hiddenTurnCount > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            Menampilkan 100 pesan terakhir ({hiddenTurnCount} pesan awal disembunyikan agar tampilan
            tetap ringan).
          </p>
        )}

        {visibleTurns.map((t: ChatTurn) => {
          const isUser = t.role === "user";
          const isNewAssistantTurn = !isUser && !animatedTurnIdsRef.current.has(t.id);

          return (
            <div
              key={t.id}
              className={cn("group flex gap-2.5", isUser ? "justify-end" : "justify-start")}
            >
              {!isUser && (
                <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/20">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}

              <div
                className={cn(
                  "relative max-w-[85%] min-w-0 rounded-2xl text-sm break-words transition-all",
                  variant === "page" ? "px-3.5 py-2 leading-relaxed" : "px-3 py-1.5",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/70 bg-card text-foreground shadow-2xs",
                  !isUser && (t.toolResults?.length ?? 0) > 0 && "w-full max-w-full",
                )}
              >
                {!isUser && (
                  <div className="mb-1 flex items-center justify-between gap-2 border-b border-border/40 pb-1">
                    <span className="text-[10px] font-semibold tracking-wide uppercase text-primary">
                      Asisten AI
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(t.id, t.text)}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 group-hover:opacity-100"
                      title="Salin pesan"
                    >
                      {copiedId === t.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isUser ? (
                  <FormattedMessage text={t.text} />
                ) : (
                  <AiTypewriter
                    text={t.text}
                    enabled={isNewAssistantTurn}
                    onComplete={() => {
                      animatedTurnIdsRef.current.add(t.id);
                    }}
                    onTick={handleTypingTick}
                  />
                )}

                {!isUser && (t.toolResults?.length ?? 0) > 0 && (
                  <AiResultTables results={t.toolResults ?? []} />
                )}

                {isUser && t.status === "sending" && (
                  <p className="mt-0.5 animate-pulse text-right text-[10px] opacity-70">
                    Mengirim…
                  </p>
                )}
                {isUser && t.status === "failed" && (
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

              {isUser && (
                <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border/50">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div className="flex items-center gap-2.5 justify-start" aria-label="AI sedang mengetik">
            <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/20">
              <Bot className="h-3.5 w-3.5 animate-spin" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 shadow-2xs">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
                  style={{ animationDelay: `${d * 150}ms` }}
                />
              ))}
              <span className="ml-1 text-[11px] text-muted-foreground">Sedang menganalisis…</span>
            </div>
          </div>
        )}

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

      {isScrolledUp && (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Ke pesan terbaru"
            title="Ke pesan terbaru"
            className="absolute -top-10 right-4 z-20 flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1 text-xs font-medium text-foreground shadow-md backdrop-blur-xs transition-transform hover:scale-105 active:scale-95"
          >
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
            <span>Ke pesan terbaru</span>
          </button>
        </div>
      )}

      <div className={variant === "page" ? "mt-2 pt-2" : "border-t border-border p-2.5"}>
        <div
          className={cn(
            "relative flex gap-2",
            variant === "page"
              ? "rounded-2xl border border-border/80 bg-card p-2 shadow-xs transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
              : "items-end",
          )}
        >
          <Textarea
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={variant === "page" ? 2 : 1}
            placeholder={
              disabled ? "AI nonaktif" : "Tanya stok, analisa barang, atau minta buatkan dokumen…"
            }
            disabled={disabled || busy}
            className={
              variant === "page"
                ? "min-h-[48px] max-h-36 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
                : "min-h-[40px] max-h-32 resize-none rounded-xl"
            }
          />
          <div className={variant === "page" ? "flex flex-col justify-end" : undefined}>
            <Button
              size="icon"
              className={cn(
                "h-9 w-9 shrink-0 rounded-xl transition-transform active:scale-95",
                draft.trim() !== "" && "bg-primary text-primary-foreground shadow-xs",
              )}
              onClick={submit}
              disabled={disabled || busy || draft.trim() === ""}
              aria-label="Kirim"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {variant === "page" ? (
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>AI dapat keliru · Pastikan selalu verifikasi data dan usulan aksi stok</span>
            <span className="hidden sm:inline">
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                Enter
              </kbd>{" "}
              kirim ·{" "}
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                Shift+Enter
              </kbd>{" "}
              baris baru
            </span>
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">
            AI dapat keliru. Periksa usulan sebelum konfirmasi — aksi dibuat sebagai <b>Draft</b>.
          </p>
        )}
      </div>
    </>
  );
}
