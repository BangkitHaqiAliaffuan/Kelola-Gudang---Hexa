import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { aiApi, type AiChatResult, type AiProposal } from "@/lib/ai-api";
import { isApiError } from "@/lib/api";

export type ChatTurn = {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Status kirim bubble user: optimistis → terkirim / gagal (+kirim ulang). */
  status?: "sending" | "sent" | "failed";
  /** Hasil tool read (tabel) untuk turn asisten — dirender jadi tabel. */
  toolResults?: Array<{ tool: string; result: unknown }>;
};

/** Metadata satu sesi chat (indeks ringan; isi turns di key terpisah). */
export type ChatSessionMeta = {
  id: string;
  title: string;
  updatedAt: number;
};

/** Key sesi tunggal lawas (sessionStorage per-tab) — dipakai mode legacy + migrasi. */
export const AI_CHAT_LEGACY_KEY = "kg-ai-chat";
/** Batas turns tersimpan per sesi (teks ringkas, tanpa toolResults). */
export const AI_MAX_TURNS = 30;
/** Batas jumlah sesi per user (paling lama dibuang). */
export const AI_MAX_SESSIONS = 20;
/** Panjang judul otomatis dari pesan pertama. */
export const AI_TITLE_LENGTH = 40;

export function chatIndexKey(userId: number): string {
  return `kg-ai-sessions:${userId}`;
}

export function chatSessionKey(userId: number, sessionId: string): string {
  return `kg-ai-chat:${userId}:${sessionId}`;
}

export function chatActiveKey(userId: number): string {
  return `kg-ai-session-active:${userId}`;
}

function chatImportedHashKey(userId: number): string {
  return `kg-ai-imported:${userId}`;
}

/** Simpan ringkas: turn utuh tanpa toolResults/tabel agar kuota hemat. */
export function compactTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns.slice(-AI_MAX_TURNS).map((t) => {
    const { toolResults: _drop, ...rest } = t;
    return rest;
  });
}

/** Normalisasi turn simpanan: turn tanpa id diberi id, "sending" menggantung → "failed". */
export function normalizeTurns(parsed: ChatTurn[]): { turns: ChatTurn[]; maxId: number } {
  let maxId = 0;
  const turns = parsed.map((t, i) => {
    const id = typeof t.id === "number" ? t.id : i + 1;
    if (id > maxId) maxId = id;
    const base = { ...t, id };
    if (t.status === undefined) return base;
    return { ...base, status: t.status === "sending" ? ("failed" as const) : t.status };
  });
  return { turns, maxId };
}

export function titleFor(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > AI_TITLE_LENGTH ? `${oneLine.slice(0, AI_TITLE_LENGTH)}…` : oneLine;
}

export function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

/** Hash kecil (dedupe impor panel → sesi) — djb2 hex, bukan kriptografis. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* abaikan (kuota/privat) */
  }
}

/**
 * State Copilot (F8.6): buka/tutup + percakapan + usulan (HITL) + daftar sesi.
 *
 * Dua mode penyimpanan:
 * - `userId` kosong (panel + pemakaian lama): mode legacy — satu sesi di
 *   sessionStorage per-tab, perilaku persis seperti sebelumnya.
 * - `userId` angka (halaman AI Assistant): mode namespaced — multi-sesi di
 *   localStorage (`kg-ai-sessions:<uid>` + `kg-ai-chat:<uid>:<sid>`), lintas
 *   tab & browser, terisolasi per user. Logout TIDAK menghapus (tujuan persist).
 *
 * Batasan sadar: last-writer-wins bila dua tab menulis sesi yang sama;
 * `toolResults`/`pending` tidak dipersist (sensitif + proposal kedaluwarsa).
 */
export function useCopilot(userId?: number | null) {
  const namespaced = typeof userId === "number";
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState<AiProposal[]>([]);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Ref agar send() membaca turns terbaru tanpa side-effect di setState
  // (updater double-invoke di StrictMode akan mengirim ganda).
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const idRef = useRef(0);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  // Muat sesi: legacy sekali saat mount; namespaced ulang tiap userId berubah
  // (login/logout/ganti akun) agar chat user A tak bocor ke user B.
  useEffect(() => {
    if (typeof window === "undefined" || namespaced) return;
    const parsed = readJson<ChatTurn[]>(window.sessionStorage, AI_CHAT_LEGACY_KEY);
    if (parsed) {
      const { turns: normalized, maxId } = normalizeTurns(parsed);
      idRef.current = Math.max(idRef.current, maxId, 0);
      setTurns(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !namespaced || userId == null) return;
    const now = Date.now();
    let index = readJson<ChatSessionMeta[]>(window.localStorage, chatIndexKey(userId)) ?? [];
    index = index.filter((s) => typeof s.id === "string" && typeof s.title === "string");

    const loadTurns = (sid: string): ChatTurn[] => {
      const parsed = readJson<ChatTurn[]>(window.localStorage, chatSessionKey(userId, sid));
      if (!parsed) return [];
      const { turns: normalized, maxId } = normalizeTurns(parsed);
      idRef.current = Math.max(idRef.current, maxId, 0);
      return normalized;
    };

    // Buang entri kosong (sesi dibuat lalu ditinggal tanpa pesan), kecuali aktif.
    const storedActive = window.localStorage.getItem(chatActiveKey(userId));
    const pruneEmpty = (list: ChatSessionMeta[], activeId: string | null) =>
      list.filter((s) => {
        if (s.id === activeId) return true;
        return loadTurnsQuiet(s.id).length > 0;
      });
    const loadTurnsQuiet = (sid: string): ChatTurn[] =>
      readJson<ChatTurn[]>(window.localStorage, chatSessionKey(userId, sid)) ?? [];

    if (index.length === 0) {
      // Migrasi sekali dari key legacy (panel/sessionStorage tab ini): impor
      // sebagai sesi pertama agar riwayat lama tak hilang, lalu hapus key lama.
      const legacy = readJson<ChatTurn[]>(window.sessionStorage, AI_CHAT_LEGACY_KEY);
      if (legacy && legacy.length > 0) {
        const { turns: normalized, maxId } = normalizeTurns(legacy);
        idRef.current = Math.max(idRef.current, maxId, 0);
        const firstUser = normalized.find((t) => t.role === "user");
        const meta: ChatSessionMeta = {
          id: newSessionId(),
          title: firstUser ? titleFor(firstUser.text) : "Sesi lama",
          updatedAt: now,
        };
        setSessions([meta]);
        setSessionId(meta.id);
        setTurns(normalized);
        writeJson(window.localStorage, chatSessionKey(userId, meta.id), compactTurns(normalized));
        writeJson(window.localStorage, chatIndexKey(userId), [meta]);
        window.localStorage.setItem(chatActiveKey(userId), meta.id);
        try {
          window.sessionStorage.removeItem(AI_CHAT_LEGACY_KEY);
        } catch {
          /* abaikan */
        }
      } else {
        const meta: ChatSessionMeta = { id: newSessionId(), title: "Sesi 1", updatedAt: now };
        setSessions([meta]);
        setSessionId(meta.id);
        setTurns([]);
        writeJson(window.localStorage, chatIndexKey(userId), [meta]);
        window.localStorage.setItem(chatActiveKey(userId), meta.id);
      }
      setPending([]);
      return;
    }

    let activeId =
      storedActive && index.some((s) => s.id === storedActive) ? storedActive : index[0]!.id;
    const pruned = pruneEmpty(index, activeId);
    if (pruned.length === 0) {
      const meta: ChatSessionMeta = { id: newSessionId(), title: "Sesi 1", updatedAt: now };
      setSessions([meta]);
      setSessionId(meta.id);
      setTurns([]);
      setPending([]);
      writeJson(window.localStorage, chatIndexKey(userId), [meta]);
      window.localStorage.setItem(chatActiveKey(userId), meta.id);
      return;
    }
    if (!pruned.some((s) => s.id === activeId)) activeId = pruned[0]!.id;
    setSessions(pruned);
    setSessionId(activeId);
    setTurns(loadTurns(activeId));
    setPending([]);
    writeJson(window.localStorage, chatIndexKey(userId), pruned);
    window.localStorage.setItem(chatActiveKey(userId), activeId);

    // Tulis panel (legacy key) yang muncul belakangan → impor sebagai sesi baru
    // "Sesi panel" (dedupe via hash) agar pesan panel tak hilang saat buka halaman.
    const legacyLater = readJson<ChatTurn[]>(window.sessionStorage, AI_CHAT_LEGACY_KEY);
    if (legacyLater && legacyLater.length > 0) {
      const digest = hashStr(JSON.stringify(compactTurns(legacyLater)));
      const seen = window.localStorage.getItem(chatImportedHashKey(userId));
      if (seen !== digest) {
        const { turns: normalized, maxId } = normalizeTurns(legacyLater);
        idRef.current = Math.max(idRef.current, maxId, 0);
        const meta: ChatSessionMeta = { id: newSessionId(), title: "Sesi panel", updatedAt: now };
        const next = [...pruned, meta].slice(-AI_MAX_SESSIONS);
        setSessions(next);
        writeJson(window.localStorage, chatSessionKey(userId, meta.id), compactTurns(normalized));
        writeJson(window.localStorage, chatIndexKey(userId), next);
        window.localStorage.setItem(chatImportedHashKey(userId), digest);
        try {
          window.sessionStorage.removeItem(AI_CHAT_LEGACY_KEY);
        } catch {
          /* abaikan */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Simpan legacy tiap turns berubah (mode legacy saja).
  useEffect(() => {
    if (typeof window === "undefined" || namespaced) return;
    writeJson(window.sessionStorage, AI_CHAT_LEGACY_KEY, compactTurns(turns));
  }, [turns, namespaced]);

  // Simpan sesi aktif + indeks (mode namespaced saja).
  useEffect(() => {
    if (typeof window === "undefined" || !namespaced || userId == null || sessionId == null) return;
    writeJson(window.localStorage, chatSessionKey(userId, sessionId), compactTurns(turns));
    setSessions((prev) => {
      const found = prev.some((s) => s.id === sessionId);
      if (!found) return prev;
      return prev.map((s) => (s.id === sessionId ? { ...s, updatedAt: Date.now() } : s));
    });
  }, [turns, sessionId, userId, namespaced]);

  useEffect(() => {
    if (typeof window === "undefined" || !namespaced || userId == null) return;
    writeJson(window.localStorage, chatIndexKey(userId), sessions.slice(-AI_MAX_SESSIONS));
  }, [sessions, userId, namespaced]);

  useEffect(() => {
    if (typeof window === "undefined" || !namespaced || userId == null || sessionId == null) return;
    try {
      window.localStorage.setItem(chatActiveKey(userId), sessionId);
    } catch {
      /* abaikan */
    }
  }, [sessionId, userId, namespaced]);

  // Status AI: hanya ambil saat panel dibuka.
  const status = useQuery({
    queryKey: ["ai", "status"],
    queryFn: async () => (await aiApi.status()).data,
    enabled: open,
    staleTime: 30_000,
  });

  const chat = useMutation({
    mutationFn: ({
      message,
      history,
    }: {
      message: string;
      history: Array<{ role: "user" | "assistant"; text: string }>;
      turnId: number;
    }) => aiApi.chat(message, history),
    onSuccess: (res, { turnId }) => {
      const data: AiChatResult = res.data;
      const toolResults = data.tool_results ?? [];
      const assistantId = nextId();
      // Tandai echo optimistis sebagai terkirim + append HANYA bubble asisten
      // (jangan append user lagi — sudah tampil sejak dikirim).
      setTurns((t) => [
        ...t.map((x) =>
          x.id === turnId && x.status === "sending" ? { ...x, status: "sent" as const } : x,
        ),
        {
          id: assistantId,
          role: "assistant",
          text: data.message || "(tanpa jawaban)",
          toolResults,
        },
      ]);
      if (data.proposals.length > 0) {
        setPending((p) => [...p, ...data.proposals]);
        toast.info("AI Menyusun usulan aksi — mohon periksa & konfirmasi.");
      }
    },
    onError: (err, { turnId }) => {
      // Pertahankan bubble + tandai gagal (user bisa kirim ulang via retry).
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, status: "failed" as const } : x)));
      toast.error(errorText(err));
    },
  });

  const execute = useMutation({
    mutationFn: ({ id, corrections }: { id: number; corrections?: Record<string, unknown> }) =>
      aiApi.execute(id, corrections),
    onSuccess: (res, vars) => {
      setPending((p) => p.filter((x) => x.id !== vars.id));
      toast.success(res.data.message || "Aksi dijalankan.");
      setTurns((t) => [...t, { id: nextId(), role: "assistant", text: `✅ ${res.data.message}` }]);
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const reject = useMutation({
    mutationFn: (id: number) => aiApi.reject(id),
    onSuccess: (_res, id) => {
      setPending((p) => p.filter((x) => x.id !== id));
      toast.info("Usulan dibatalkan.");
    },
  });

  // Kirim 10 turn terakhir sebagai konteks (klarifikasi multi-turn).
  // Hanya role+text yang dikirim — toolResults/id/status (tabel/meta lokal)
  // tidak perlu ke backend. Echo user ditampilkan optimistis agar langsung
  // terlihat saat loading; statusnya diperbarui di onSuccess/onError.
  const send = useCallback(
    (message: string, baseTurns?: ChatTurn[]) => {
      const base = baseTurns ?? turnsRef.current;
      const history = base.slice(-10).map(({ role, text }) => ({ role, text }));
      const turnId = nextId();
      // Pesan pertama sesi kosong → jadikan judul otomatis (mode namespaced).
      const sid = sessionIdRef.current;
      if (namespaced && sid != null && base.length === 0) {
        const title = titleFor(message);
        setSessions((prev) =>
          prev.map((s) => (s.id === sid ? { ...s, title, updatedAt: Date.now() } : s)),
        );
      }
      // Bangun dari `base` (bukan updater) agar retry yang baru saja
      // membuang turn gagal tidak menghidupkannya kembali via state basi.
      setTurns([...base, { id: turnId, role: "user", text: message, status: "sending" as const }]);
      chat.mutate({ message, history, turnId });
    },
    [chat, namespaced],
  );
  // Kirim ulang turn yang gagal: buang bubble gagal dulu agar tidak ganda,
  // lalu kirim dengan history yang sudah dibersihkan dari turn tersebut.
  const retry = useCallback(
    (turnId: number) => {
      const failed = turnsRef.current.find((t) => t.id === turnId);
      if (!failed || failed.status !== "failed") return;
      const base = turnsRef.current.filter((t) => t.id !== turnId);
      setTurns(base);
      send(failed.text, base);
    },
    [send],
  );
  // Bersihkan isi SESI AKTIF (turns + pending). Sesi lain tak tersentuh.
  const clear = useCallback(() => {
    setTurns([]);
    setPending([]);
  }, []);

  const switchSession = useCallback(
    (id: string) => {
      if (typeof window === "undefined" || !namespaced || userId == null) return;
      if (id === sessionIdRef.current) return;
      const parsed = readJson<ChatTurn[]>(window.localStorage, chatSessionKey(userId, id));
      const { turns: normalized, maxId } = normalizeTurns(parsed ?? []);
      idRef.current = maxId;
      setSessionId(id);
      setTurns(normalized);
      setPending([]);
    },
    [namespaced, userId],
  );

  const newSession = useCallback(() => {
    if (typeof window === "undefined" || !namespaced || userId == null) {
      clear();
      return;
    }
    const meta: ChatSessionMeta = {
      id: newSessionId(),
      title: `Sesi ${sessions.length + 1}`,
      updatedAt: Date.now(),
    };
    setSessions((prev) => [...prev, meta].slice(-AI_MAX_SESSIONS));
    idRef.current = 0;
    setSessionId(meta.id);
    setTurns([]);
    setPending([]);
  }, [namespaced, userId, sessions.length, clear]);

  const renameSession = useCallback((id: string, title: string) => {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, AI_TITLE_LENGTH);
    if (!clean) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: clean, updatedAt: Date.now() } : s)),
    );
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      if (typeof window === "undefined" || !namespaced || userId == null) {
        clear();
        return;
      }
      try {
        window.localStorage.removeItem(chatSessionKey(userId, id));
      } catch {
        /* abaikan */
      }
      const rest = sessionsRef.current.filter((s) => s.id !== id);
      if (id !== sessionIdRef.current) {
        setSessions(rest);
        return;
      }
      if (rest.length === 0) {
        const meta: ChatSessionMeta = {
          id: newSessionId(),
          title: "Sesi 1",
          updatedAt: Date.now(),
        };
        idRef.current = 0;
        setSessions([meta]);
        setSessionId(meta.id);
        setTurns([]);
        setPending([]);
        return;
      }
      const next = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
      const parsed = readJson<ChatTurn[]>(window.localStorage, chatSessionKey(userId, next.id));
      const { turns: normalized, maxId } = normalizeTurns(parsed ?? []);
      idRef.current = maxId;
      setSessions(rest);
      setSessionId(next.id);
      setTurns(normalized);
      setPending([]);
    },
    [namespaced, userId, clear],
  );

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    turns,
    pending,
    send,
    retry,
    clear,
    chat,
    execute,
    reject,
    status,
    sessions,
    sessionId,
    newSession,
    switchSession,
    renameSession,
    deleteSession,
  };
}

function errorText(err: unknown): string {
  if (isApiError(err)) return err.message;
  return err instanceof Error ? err.message : "Terjadi kesalahan.";
}
