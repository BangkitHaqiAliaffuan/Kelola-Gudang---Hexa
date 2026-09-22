import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { AiChatView } from "./ai-chat-view";
import {
  CATEGORIZED_PROMPTS,
  QUICK_PROMPTS,
  WELCOME_FEATURES,
  WELCOME_NOTES,
} from "./ai-chat-view";
import { useCopilot } from "@/hooks/use-copilot";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

// jsdom tidak punya matchMedia (AiTypewriter), clipboard, maupun
// Element.scrollTo (auto-scroll AiChatView).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}
Object.defineProperty(Element.prototype, "scrollTo", {
  writable: true,
  value: () => {},
});

const writeText = vi.fn();

function stubClipboard() {
  // Dipanggil ulang setelah userEvent.setup() karena user-event ikut
  // mendefinisikan ulang navigator.clipboard miliknya.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText },
  });
  // Jalur modern mensyaratkan secure-context; paksa true agar writeText terpakai.
  try {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      writable: true,
      value: true,
    });
  } catch {
    /* abaikan */
  }
}
stubClipboard();

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

type FakeCopilot = ReturnType<typeof useCopilot>;

function fakeCopilot(): FakeCopilot {
  return {
    open: true,
    setOpen: vi.fn(),
    toggle: vi.fn(),
    turns: [{ id: 7, role: "assistant", text: "Stok Baut M8: 4 PCS", status: "sent" }],
    pending: [],
    send: vi.fn(),
    retry: vi.fn(),
    clear: vi.fn(),
    chat: { isPending: false },
    execute: { isPending: false },
    reject: { mutate: vi.fn(), isPending: false },
    status: { data: { enabled: true, available: true } },
  } as unknown as FakeCopilot;
}

describe("AiChatView tombol salin (TC-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("klik Salin menulis teks pesan ke clipboard + label Disalin", async () => {
    const user = userEvent.setup();
    stubClipboard();
    render(<AiChatView copilot={fakeCopilot()} variant="page" />, { wrapper });

    expect(screen.getByText("Stok Baut M8: 4 PCS")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salin" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("Stok Baut M8: 4 PCS");
    expect(screen.getByText("Disalin")).toBeTruthy();
  });

  it("salin yang gagal tidak menampilkan Disalin + toast error", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    stubClipboard();
    writeText.mockRejectedValueOnce(new Error("denied"));
    // Matikan fallback legacy untuk test ini (jsdom tak selalu punya execCommand).
    const origExec = (document as unknown as Record<string, unknown>)["execCommand"];
    (document as unknown as Record<string, unknown>)["execCommand"] = () => false;
    try {
      render(<AiChatView copilot={fakeCopilot()} variant="page" />, { wrapper });

      await user.click(screen.getByRole("button", { name: "Salin" }));

      expect(screen.queryByText("Disalin")).toBeNull();
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
    } finally {
      (document as unknown as Record<string, unknown>)["execCommand"] = origExec;
    }
  });
});

function HydratedHarness() {
  const copilot = useCopilot();
  return <AiChatView copilot={copilot} variant="page" />;
}

describe("AiChatView tanpa emoji di string UI", () => {
  it("prompt & sapaan bebas emoji (emoji merusak payload model + screen reader)", () => {
    const texts = [
      ...QUICK_PROMPTS,
      ...WELCOME_FEATURES,
      ...WELCOME_NOTES,
      ...CATEGORIZED_PROMPTS.flatMap((c) => c.prompts),
    ];
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("AiChatView hidrasi riwayat (TC-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("pesan lama dari sessionStorage langsung tampil utuh tanpa animasi", () => {
    vi.useFakeTimers();
    try {
      window.sessionStorage.setItem(
        "kg-ai-chat",
        JSON.stringify([{ id: 3, role: "assistant", text: "Stok lama: 9 PCS", status: "sent" }]),
      );
      render(<HydratedHarness />, { wrapper });

      // Tanpa memajukan timer animasi sama sekali, teks penuh harus tampil.
      expect(screen.getByText("Stok lama: 9 PCS")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
