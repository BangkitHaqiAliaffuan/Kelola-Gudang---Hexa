import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { aiApi } from "@/lib/ai-api";
import { authApi } from "@/lib/auth-api";
import { AuthProvider } from "@/hooks/use-auth";
import { Route } from "./ai-assistant";

vi.mock("@/lib/ai-api", () => ({
  aiApi: { status: vi.fn(), chat: vi.fn(), execute: vi.fn(), reject: vi.fn() },
}));
vi.mock("@/lib/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-api")>();
  return {
    ...actual,
    authApi: { me: vi.fn(), login: vi.fn(), logout: vi.fn() },
  };
});
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

// jsdom tidak punya matchMedia (AiTypewriter) maupun Element.scrollTo.
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

const Page = Route.options.component as React.ComponentType;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function seedAdmin() {
  window.localStorage.setItem("kg-token", "test-token");
  vi.mocked(authApi.me).mockResolvedValue({
    data: {
      id: 1,
      code: "USR-001",
      name: "Admin Tes",
      email: "admin@tes.id",
      role: "Administrator",
      default_warehouse_id: null,
      warehouse: null,
      is_active: true,
      created_at: "",
      updated_at: "",
    },
    access: [
      { module: "AI Assistant", level: "Baca" },
      { module: "Persediaan", level: "Kelola" },
    ],
    can_review: false,
    warehouse_scope: { mode: "Semua", ids: null },
  } as never);
  vi.mocked(aiApi.status).mockResolvedValue({
    data: { enabled: true, available: true, provider: "test" },
  } as never);
}

function seedChat() {
  window.sessionStorage.setItem(
    "kg-ai-chat",
    JSON.stringify([{ id: 1, role: "user", text: "cek stok baut", status: "sent" }]),
  );
}

// Teks bubble chat (bukan judul di sidebar <aside> maupun <option> select mobile).
function chatTexts(text: string): HTMLElement[] {
  return screen
    .queryAllByText(text)
    .filter((el) => el.tagName !== "OPTION" && !el.closest("aside"));
}

describe("AiAssistantPage dialog Bersihkan Chat (TC-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    seedAdmin();
  });

  it("header menampilkan status Siap + cakupan Semua Gudang", async () => {
    seedChat();
    render(<Page />, { wrapper });

    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
    expect(screen.getByText(/Siap ·/)).toBeTruthy();
    expect(screen.getByText("Cakupan: Semua Gudang")).toBeTruthy();
  });

  it("klik Bersihkan Chat membuka dialog tanpa langsung menghapus", async () => {
    const user = userEvent.setup();
    seedChat();
    render(<Page />, { wrapper });

    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Bersihkan Chat" }));

    expect(screen.getByText("Hapus sesi ini?")).toBeTruthy();
    expect(chatTexts("cek stok baut")).not.toHaveLength(0);
  });

  it("Batal menutup dialog dan mempertahankan chat", async () => {
    const user = userEvent.setup();
    seedChat();
    render(<Page />, { wrapper });

    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Bersihkan Chat" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByText("Hapus sesi ini?")).toBeNull());
    expect(chatTexts("cek stok baut")).not.toHaveLength(0);
  });

  it("Ya, bersihkan menghapus isi sesi aktif halaman", async () => {
    const user = userEvent.setup();
    seedChat();
    render(<Page />, { wrapper });

    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Bersihkan Chat" }));
    await user.click(screen.getByRole("button", { name: "Ya, bersihkan" }));

    await waitFor(() => expect(chatTexts("cek stok baut")).toHaveLength(0));
    expect(screen.queryByText("Hapus sesi ini?")).toBeNull();
  });
});

describe("AiAssistantPage daftar sesi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    seedAdmin();
  });

  it("riwayat legacy dimigrasi menjadi sesi dan Sesi baru menambah daftar", async () => {
    const user = userEvent.setup();
    seedChat();
    render(<Page />, { wrapper });

    // Migrasi: judul sesi mengikuti pesan pertama.
    await waitFor(() => expect(screen.getByText("Sesi tersimpan · 1")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Sesi baru" }));

    await waitFor(() => expect(screen.getByText("Sesi tersimpan · 2")).toBeTruthy());
    // Sesi baru kosong — bubble sesi lama tak tampil (judul sidebar tetap ada).
    expect(chatTexts("cek stok baut")).toHaveLength(0);
  });

  it("klik sesi lama memuat kembali isinya", async () => {
    const user = userEvent.setup();
    seedChat();
    render(<Page />, { wrapper });

    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Sesi baru" }));
    await waitFor(() => expect(chatTexts("cek stok baut")).toHaveLength(0));

    await user.click(screen.getByRole("button", { name: "Buka sesi cek stok baut" }));
    await waitFor(() => expect(chatTexts("cek stok baut")).not.toHaveLength(0));
  });
});
