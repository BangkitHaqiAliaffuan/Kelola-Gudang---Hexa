import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { aiApi, type AiChatResult } from "@/lib/ai-api";
import { chatIndexKey, chatSessionKey, compactTurns, titleFor, useCopilot } from "./use-copilot";

vi.mock("@/lib/ai-api", () => ({
  aiApi: { status: vi.fn(), chat: vi.fn(), execute: vi.fn(), reject: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ChatResponse = { data: AiChatResult };

function chatOk(message: string): ChatResponse {
  return { data: { message, proposals: [], tool_results: [], model: "fake" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("useCopilot optimistic echo", () => {
  it("bubble user langsung tampil berstatus sending sebelum respons tiba", async () => {
    const d = deferred<ChatResponse>();
    vi.mocked(aiApi.chat).mockReturnValueOnce(d.promise as never);

    const { result } = renderHook(() => useCopilot(), { wrapper });
    act(() => {
      result.current.send("stok baut M8?");
    });

    // Echo terlihat SEMENTARA loading (inti: user tahu apa yang diketik).
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toMatchObject({
      role: "user",
      text: "stok baut M8?",
      status: "sending",
    });
    expect(result.current.chat.isPending).toBe(true);

    await act(async () => {
      d.resolve(chatOk("Ada 50 pcs."));
    });
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));

    // Sukses: tepat 1 user + 1 asisten (tidak duplikat).
    expect(result.current.turns.filter((t) => t.role === "user")).toHaveLength(1);
    expect(result.current.turns.filter((t) => t.role === "assistant")).toHaveLength(1);
    expect(result.current.turns[0]?.status).toBe("sent");
  });

  it("history ke server hanya role+text (tanpa id/status/meta lokal)", async () => {
    vi.mocked(aiApi.chat).mockResolvedValue(chatOk("ok") as never);

    const { result } = renderHook(() => useCopilot(), { wrapper });
    await act(async () => {
      result.current.send("pesan satu");
    });
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));
    await act(async () => {
      result.current.send("pesan dua");
    });
    await waitFor(() => expect(vi.mocked(aiApi.chat)).toHaveBeenCalledTimes(2));

    const secondHistory = vi.mocked(aiApi.chat).mock.calls[1]?.[1] as Array<
      Record<string, unknown>
    >;
    expect(secondHistory.length).toBeGreaterThan(0);
    for (const h of secondHistory) {
      expect(Object.keys(h).sort()).toEqual(["role", "text"]);
    }
  });

  it("gagal → bubble dipertahankan + retry mengirim ulang tanpa ganda", async () => {
    vi.mocked(aiApi.chat).mockRejectedValueOnce(new Error("padam"));
    vi.mocked(aiApi.chat).mockResolvedValueOnce(chatOk("akhirnya masuk") as never);

    const { result } = renderHook(() => useCopilot(), { wrapper });
    await act(async () => {
      result.current.send("cek stok");
    });
    await waitFor(() => expect(result.current.turns[0]?.status).toBe("failed"));
    const failedId = result.current.turns[0]!.id;

    await act(async () => {
      result.current.retry(failedId);
    });
    await waitFor(() => expect(vi.mocked(aiApi.chat)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));

    // Turn gagal dibuang, hasil akhir: 1 user (sent) + 1 asisten.
    expect(result.current.turns.filter((t) => t.role === "user")).toHaveLength(1);
    expect(result.current.turns[0]?.status).toBe("sent");
    expect(result.current.turns.filter((t) => t.role === "assistant")).toHaveLength(1);
  });
});

describe("useCopilot helper sesi", () => {
  it("titleFor memotong pesan panjang menjadi satu baris", () => {
    expect(titleFor("cek stok baut")).toBe("cek stok baut");
    const long = `${"a".repeat(50)} ekor`;
    expect(titleFor(long)).toHaveLength(41);
    expect(titleFor(long).endsWith("…")).toBe(true);
  });

  it("compactTurns membuang toolResults dan memangkas 30 turn", () => {
    const turns = Array.from({ length: 35 }, (_, i) => ({
      id: i + 1,
      role: "user" as const,
      text: `pesan ${i + 1}`,
      toolResults: [{ tool: "x", result: {} }],
    }));
    const compact = compactTurns(turns);
    expect(compact).toHaveLength(30);
    expect(compact[0]).toEqual({ id: 6, role: "user", text: "pesan 6", status: undefined });
  });
});

describe("useCopilot multi-sesi per-user", () => {
  it("pesan pertama menjadi judul otomatis sesi", async () => {
    vi.mocked(aiApi.chat).mockResolvedValue(chatOk("Ada 50 pcs.") as never);

    const { result } = renderHook(() => useCopilot(1), { wrapper });
    await act(async () => {
      result.current.send("cek stok baut M8?");
    });
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]?.title).toBe("cek stok baut M8?");
  });

  it("sesi tersimpan di localStorage namespaced dan selamat lintas mount", async () => {
    vi.mocked(aiApi.chat).mockResolvedValue(chatOk("ok") as never);

    const first = renderHook(() => useCopilot(1), { wrapper });
    await act(async () => {
      first.result.current.send("pesan tersimpan?");
    });
    await waitFor(() => expect(first.result.current.chat.isPending).toBe(false));
    first.unmount();

    const second = renderHook(() => useCopilot(1), { wrapper });
    await waitFor(() =>
      expect(second.result.current.turns.map((t) => t.text)).toContain("pesan tersimpan?"),
    );
    expect(window.localStorage.getItem(chatIndexKey(1))).toContain("pesan tersimpan?");
  });

  it("ganti sesi menyimpan dan memuat isi masing-masing", async () => {
    vi.mocked(aiApi.chat).mockResolvedValue(chatOk("ok") as never);

    const { result } = renderHook(() => useCopilot(1), { wrapper });
    await act(async () => {
      result.current.send("pesan sesi A");
    });
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));
    const sessionA = result.current.sessionId!;

    act(() => {
      result.current.newSession();
    });
    await act(async () => {
      result.current.send("pesan sesi B");
    });
    await waitFor(() => expect(result.current.turns.map((t) => t.text)).toContain("pesan sesi B"));
    expect(result.current.sessions).toHaveLength(2);

    act(() => {
      result.current.switchSession(sessionA);
    });
    expect(result.current.turns.map((t) => t.text)).toContain("pesan sesi A");
    expect(result.current.turns.map((t) => t.text)).not.toContain("pesan sesi B");
  });

  it("hapus sesi aktif berpindah ke sesi terbaru yang tersisa", async () => {
    vi.mocked(aiApi.chat).mockResolvedValue(chatOk("ok") as never);

    const { result } = renderHook(() => useCopilot(1), { wrapper });
    await act(async () => {
      result.current.send("tetap ada");
    });
    await waitFor(() => expect(result.current.chat.isPending).toBe(false));
    const sessionA = result.current.sessionId!;

    act(() => {
      result.current.newSession();
    });
    const sessionB = result.current.sessionId!;
    expect(sessionB).not.toBe(sessionA);

    act(() => {
      result.current.deleteSession(sessionB);
    });
    expect(result.current.sessionId).toBe(sessionA);
    expect(result.current.turns.map((t) => t.text)).toContain("tetap ada");
    expect(window.localStorage.getItem(chatSessionKey(1, sessionB))).toBeNull();
  });

  it("migrasi key legacy menjadi sesi pertama dan terisolasi per user", async () => {
    window.sessionStorage.setItem(
      "kg-ai-chat",
      JSON.stringify([{ id: 1, role: "user", text: "riwayat lama", status: "sent" }]),
    );

    const { result } = renderHook(() => useCopilot(7), { wrapper });
    await waitFor(() => expect(result.current.turns.map((t) => t.text)).toContain("riwayat lama"));
    expect(result.current.sessions[0]?.title).toBe("riwayat lama");
    expect(window.sessionStorage.getItem("kg-ai-chat")).toBeNull();

    // User lain tidak melihat sesi user 7.
    const other = renderHook(() => useCopilot(8), { wrapper });
    await waitFor(() => expect(other.result.current.sessions).toHaveLength(1));
    expect(other.result.current.turns).toHaveLength(0);
    expect(other.result.current.sessions[0]?.title).toBe("Sesi 1");
  });
});
