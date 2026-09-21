import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { aiApi, type AiChatResult } from "@/lib/ai-api";
import { useCopilot } from "./use-copilot";

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
