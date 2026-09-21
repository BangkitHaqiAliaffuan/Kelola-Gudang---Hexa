import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Minus, Pencil, Plus, Send } from "lucide-react";

import { useCopilot, type ChatTurn } from "@/hooks/use-copilot";
import type { AiProposal, AiProposalPreview } from "@/lib/ai-api";
import { AiResultTables } from "./ai-result-table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Flag localStorage: sapaan lengkap hanya di pembukaan pertama. */
const WELCOME_FLAG_KEY = "kg-ai-welcomed";

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [copilot.turns, copilot.pending, copilot.chat.isPending]);

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
        ref={scrollRef}
        aria-live="polite"
        className={
          variant === "page"
            ? "grid flex-1 content-start gap-3 overflow-y-auto"
            : "flex-1 space-y-3 overflow-y-auto px-3 py-3"
        }
      >
        {copilot.turns.length === 0 && !copilot.chat.isPending && (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            {showFullWelcome ? (
              <>
                <p className="mb-1 text-sm font-semibold text-foreground">
                  Halo! Saya Asisten AI KelolaGudang 👋
                </p>
                <p className="mb-2">
                  Saya membantu pekerjaan gudang lewat percakapan — tanya data atau minta dibuatkan
                  draft dokumen.
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
              <p className="mb-2 font-medium text-foreground">Halo! Ada yang bisa saya bantu? 👋</p>
            )}
            <p className="mb-2 font-medium text-foreground">Contoh perintah (klik untuk kirim):</p>
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

        {copilot.turns.map((t: ChatTurn) => (
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
                t.role === "assistant" && (t.toolResults?.length ?? 0) > 0 && "w-full max-w-full",
              )}
            >
              <FormattedMessage text={t.text} />
              {t.role === "assistant" && (t.toolResults?.length ?? 0) > 0 && (
                <AiResultTables results={t.toolResults ?? []} />
              )}
              {t.role === "user" && t.status === "sending" && (
                <p className="mt-0.5 animate-pulse text-right text-[10px] opacity-70">Mengirim…</p>
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

      <div className={variant === "page" ? "mt-3 flex gap-2" : "border-t border-border p-2.5"}>
        <div className={variant === "page" ? "flex flex-1 gap-2" : "flex items-end gap-2"}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={variant === "page" ? 2 : 1}
            placeholder={disabled ? "AI nonaktif" : "Tanya atau perintahkan…"}
            disabled={disabled || busy}
            className={
              variant === "page"
                ? "min-h-11 rounded-xl"
                : "min-h-[40px] max-h-32 resize-none rounded-xl"
            }
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
        {variant === "panel" && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            AI dapat keliru. Periksa usulan sebelum konfirmasi — aksi dibuat sebagai <b>Draft</b>.
          </p>
        )}
      </div>
    </>
  );
}
