import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { aiApi } from "@/lib/ai-api";
import { CopilotPanel, FormattedMessage } from "./copilot-panel";

vi.mock("@/lib/ai-api", () => ({
  aiApi: { status: vi.fn(), chat: vi.fn(), execute: vi.fn(), reject: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

// jsdom tidak punya matchMedia (dipakai CopilotPanel untuk mode desktop dan
// prefers-reduced-motion) maupun Element.scrollTo (dipakai auto-scroll).
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

function mockMatchMedia(matches: boolean) {
  window.matchMedia = () => ({
    matches,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
Object.defineProperty(Element.prototype, "scrollTo", {
  writable: true,
  value: () => {},
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function seedChat() {
  window.sessionStorage.setItem(
    "kg-ai-chat",
    JSON.stringify([{ id: 1, role: "user", text: "cek stok baut", status: "sent" }]),
  );
}

function renderPanel(onClose: () => void = () => {}) {
  return render(<CopilotPanel open onClose={onClose} />, { wrapper });
}

describe("FormattedMessage", () => {
  it("merender **tebal** sebagai strong", () => {
    render(<FormattedMessage text="Stok **Baut M8** menipis" />);
    const strong = screen.getByText("Baut M8");
    expect(strong.tagName).toBe("STRONG");
  });

  it("merender bullet dan numbering sebagai list", () => {
    render(<FormattedMessage text={"- Baut M8\n- Baut M10\n\n1. Pilih varian\n2. Sebutkan qty"} />);
    expect(screen.getByText("Baut M8").closest("li")).not.toBeNull();
    expect(screen.getByText("Pilih varian").closest("li")).not.toBeNull();
    expect(document.querySelectorAll("ul").length).toBe(1);
    expect(document.querySelectorAll("ol").length).toBe(1);
  });

  it("tidak mengeksekusi HTML injeksi (render sebagai teks inert)", () => {
    const evil = `<img src=x onerror="alert(1)"> <script>alert(2)</script>`;
    const { container } = render(<FormattedMessage text={evil} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/onerror/, { exact: false })).toBeTruthy();
  });

  it("tidak membuat link javascript: yang bisa diklik", () => {
    const { container } = render(<FormattedMessage text="[klik](javascript:alert(1))" />);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("CopilotPanel konfirmasi Bersihkan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockMatchMedia(false);
    vi.mocked(aiApi.status).mockResolvedValue({
      data: { enabled: true, available: true, provider: "test" },
    } as never);
  });

  it("klik Bersihkan membuka dialog tanpa langsung menghapus chat", async () => {
    const user = userEvent.setup();
    seedChat();
    renderPanel();

    expect(screen.getByText("cek stok baut")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Bersihkan" }));

    expect(screen.getByText("Hapus riwayat chat?")).toBeTruthy();
    // Chat masih utuh di belakang dialog.
    expect(screen.getByText("cek stok baut")).toBeTruthy();
  });

  it("Batal menutup dialog dan mempertahankan chat", async () => {
    const user = userEvent.setup();
    seedChat();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Bersihkan" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByText("Hapus riwayat chat?")).toBeNull());
    expect(screen.getByText("cek stok baut")).toBeTruthy();
  });

  it("Ya, hapus membersihkan seluruh chat", async () => {
    const user = userEvent.setup();
    seedChat();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Bersihkan" }));
    await user.click(screen.getByRole("button", { name: "Ya, hapus" }));

    await waitFor(() => expect(screen.queryByText("cek stok baut")).toBeNull());
    expect(screen.queryByText("Hapus riwayat chat?")).toBeNull();
    // Kembali ke empty state contoh perintah.
    expect(screen.getByText(/Contoh perintah/)).toBeTruthy();
  });

  it("tombol Bersihkan disabled saat chat masih kosong", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Bersihkan" })).toBeDisabled();
  });
});

describe("CopilotPanel sapaan pembuka", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockMatchMedia(false);
    vi.mocked(aiApi.status).mockResolvedValue({
      data: { enabled: true, available: true, provider: "test" },
    } as never);
  });

  it("pembukaan pertama menampilkan sapaan lengkap + contoh perintah", () => {
    renderPanel();

    expect(screen.getByText(/Halo! Saya Asisten AI KelolaGudang/)).toBeTruthy();
    expect(screen.getByText("Saya bisa bantu:")).toBeTruthy();
    expect(screen.getByText("Perlu Anda tahu:")).toBeTruthy();
    expect(screen.getByText(/Contoh perintah/)).toBeTruthy();
  });

  it("pembukaan berikutnya menampilkan sapaan ringkas saja", () => {
    window.localStorage.setItem("kg-ai-welcomed", "1");
    renderPanel();

    expect(screen.getByText(/Ada yang bisa saya bantu/)).toBeTruthy();
    expect(screen.queryByText("Saya bisa bantu:")).toBeNull();
    expect(screen.getByText(/Contoh perintah/)).toBeTruthy();
  });

  it("sapaan hilang setelah ada riwayat chat", () => {
    seedChat();
    renderPanel();

    expect(screen.queryByText(/Halo! Saya Asisten AI/)).toBeNull();
    expect(screen.queryByText(/Ada yang bisa saya bantu/)).toBeNull();
    expect(screen.getByText("cek stok baut")).toBeTruthy();
  });

  it("menampilkan catatan nonaktif saat AI disabled", async () => {
    vi.mocked(aiApi.status).mockResolvedValue({
      data: { enabled: false, available: false, provider: "test" },
    } as never);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/AI sedang nonaktif/)).toBeTruthy());
  });
});

describe("CopilotPanel animasi tutup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockMatchMedia(false);
    vi.mocked(aiApi.status).mockResolvedValue({
      data: { enabled: true, available: true, provider: "test" },
    } as never);
  });

  it("klik Tutup memainkan exit lalu memanggil onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel(onClose);

    await user.click(screen.getByRole("button", { name: "Tutup" }));

    // onClose ditunda hingga animasi keluar selesai; panel masih mounted.
    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Asisten AI KelolaGudang" });
    expect(dialog.className).toContain("slide-out-to-bottom-4");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Esc memainkan exit yang sama", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel(onClose);

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Asisten AI KelolaGudang" }).className).toContain(
      "slide-out-to-bottom-4",
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("reduced-motion menutup langsung tanpa animasi", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel(onClose);

    await user.click(screen.getByRole("button", { name: "Tutup" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Asisten AI KelolaGudang" }).className).not.toContain(
      "slide-out-to-bottom-4",
    );
  });
});
