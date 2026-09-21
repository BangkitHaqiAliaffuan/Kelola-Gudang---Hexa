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

/**
 * State pop-up Copilot (F8.6): buka/tutup + percakapan + usulan (HITL).
 * Percakapan disimpan di sessionStorage per-tab (tidak lintas sesi).
 */
export function useCopilot() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState<AiProposal[]>([]);
  // Ref agar send() membaca turns terbaru tanpa side-effect di setState
  // (updater double-invoke di StrictMode akan mengirim ganda).
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const idRef = useRef(0);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  // Muat riwayat percakapan tab ini (sekali). Normalisasi: turn lama tanpa id
  // diberi id, status "sending" yang menggantung (tab ditutup saat request
  // jalan) dicoerce ke "failed" agar tak ada spinner abadi.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("kg-ai-chat");
      if (raw) {
        const parsed = JSON.parse(raw) as ChatTurn[];
        let maxId = 0;
        const normalized = parsed.map((t, i) => {
          const id = typeof t.id === "number" ? t.id : i + 1;
          if (id > maxId) maxId = id;
          const base = { ...t, id };
          if (t.status === undefined) return base;
          return { ...base, status: t.status === "sending" ? ("failed" as const) : t.status };
        });
        idRef.current = Math.max(idRef.current, maxId, 0);
        setTurns(normalized);
      }
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("kg-ai-chat", JSON.stringify(turns.slice(-40)));
    } catch {
      /* abaikan */
    }
  }, [turns]);

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
      // Bangun dari `base` (bukan updater) agar retry yang baru saja
      // membuang turn gagal tidak menghidupkannya kembali via state basi.
      setTurns([...base, { id: turnId, role: "user", text: message, status: "sending" as const }]);
      chat.mutate({ message, history, turnId });
    },
    [chat],
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
  const clear = useCallback(() => {
    setTurns([]);
    setPending([]);
  }, []);

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
  };
}

function errorText(err: unknown): string {
  if (isApiError(err)) return err.message;
  return err instanceof Error ? err.message : "Terjadi kesalahan.";
}
