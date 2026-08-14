import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to?: string;
      params?: unknown;
      children?: ReactNode;
    } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        href={typeof to === "string" ? to : "/"}
        data-to={to}
        data-params={params != null ? JSON.stringify(params) : undefined}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

const { opnameFixture } = vi.hoisted(() => ({
  opnameFixture: [
    {
      id: 1,
      no: "SO/2026/00001",
      type: "Stock Opname",
      status: "Draft",
      document_date: "2026-07-28T00:00:00+07:00",
      warehouse: "Gudang Utama",
      line_count: 10,
      checked_count: 4,
    },
    {
      id: 2,
      no: "SO/2026/00002",
      type: "Stock Opname",
      status: "Draft",
      document_date: "2026-07-29T00:00:00+07:00",
      warehouse: "Gudang Satelit",
      line_count: 8,
      checked_count: 2,
    },
    {
      id: 3,
      no: "SO/2026/00003",
      type: "Stock Opname",
      status: "Selesai",
      document_date: "2026-07-01T00:00:00+07:00",
      warehouse: "Gudang Utama",
      line_count: 5,
      checked_count: 5,
    },
  ] as const,
}));

vi.mock("@/hooks/use-persediaan", () => ({
  useStockDocuments: () => ({ data: { data: opnameFixture }, isLoading: false }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: null,
    access: [],
    login: vi.fn(),
    logout: vi.fn(),
    hasModule: () => true,
    hasModuleLevel: () => true,
  }),
}));

import { Route } from "@/routes/index";
import {
  activities,
  formatIDRCompact,
  formatNumber,
  items,
  lowStock,
  monthly,
  outStock,
  totalValue,
  transactions,
  warehouses,
} from "@/lib/wms-data";

const DashboardView = Route.options.component as ComponentType;

function getStatCard(label: string): HTMLElement {
  for (const el of screen.getAllByText(label)) {
    const card = el.closest(".card-soft");
    if (card && card.querySelector("p.text-xl")) {
      return card as HTMLElement;
    }
  }
  throw new Error(`StatCard "${label}" tidak ditemukan`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard (index route)", () => {
  it("merender header sambutan dan status sistem", () => {
    render(<DashboardView />);
    expect(screen.getByText("Selamat datang, Rudi 👋")).toBeInTheDocument();
    expect(screen.getByText(/Ringkasan operasional gudang hari ini/)).toBeInTheDocument();
    expect(screen.getByText("Semua sistem normal")).toBeInTheDocument();
  });

  it("merender 10 StatCard dengan nilai turunan wms-data", () => {
    const { container } = render(<DashboardView />);
    expect(container.querySelectorAll("p.text-xl")).toHaveLength(10);

    const masukToday = transactions.filter((t) => t.type === "Barang Masuk").slice(0, 24);
    const keluarToday = transactions.filter((t) => t.type === "Barang Keluar").slice(0, 18);
    const pending = transactions.filter((t) => t.status === "Menunggu Approval").length;
    const running = opnameFixture.filter((o) => o.status === "Draft");

    const cases: Array<[label: string, value: string, hint?: string]> = [
      ["Total Item", formatNumber(items.reduce((a, b) => a + b.stock, 0)), "seluruh gudang"],
      ["Total SKU", formatNumber(items.length), "barang aktif terdaftar"],
      ["Total Gudang", String(warehouses.length), "lokasi penyimpanan"],
      [
        "Barang Masuk Hari Ini",
        formatNumber(masukToday.reduce((a, b) => a + b.qty, 0)),
        `${masukToday.length} transaksi`,
      ],
      [
        "Barang Keluar Hari Ini",
        formatNumber(keluarToday.reduce((a, b) => a + b.qty, 0)),
        `${keluarToday.length} transaksi`,
      ],
      ["Stock Menipis", formatNumber(lowStock.length), "di bawah minimum"],
      ["Stock Habis", formatNumber(outStock.length), "perlu restock segera"],
      ["Nilai Persediaan", formatIDRCompact(totalValue), "metode FIFO"],
      ["Pending Approval", String(pending), "menunggu supervisor"],
      ["Stock Opname Berjalan", String(running.length), "sesi aktif"],
    ];

    for (const [label, value, hint] of cases) {
      const card = getStatCard(label);
      expect(card.querySelector(".text-xl")?.textContent?.replace(/\s+/g, " ")).toBe(
        value.replace(/\s+/g, " "),
      );
      if (hint) {
        expect(within(card).getByText(hint)).toBeInTheDocument();
      }
    }
  });

  it("menampilkan skeleton saat loading, lalu chart setelah 600ms", () => {
    vi.useFakeTimers();
    const { container } = render(<DashboardView />);
    expect(container.querySelector(".recharts-bar")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(container.querySelector(".recharts-bar")).not.toBeNull();
  });

  it("merender 3 chart bulanan dari data monthly", async () => {
    const { container } = render(<DashboardView />);

    await waitFor(() => expect(container.querySelector(".recharts-bar")).toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(monthly).toHaveLength(12);
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(24);
    expect(container.querySelector(".recharts-line-curve")).toBeInTheDocument();
    expect(container.querySelector(".recharts-area")).toBeInTheDocument();
    expect(container.querySelector("#nilaiGrad")).toBeInTheDocument();
    expect(screen.getAllByText(/Jt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Barang Masuk & Keluar per Bulan").length).toBe(1);
    expect(screen.getAllByText("Pergerakan Stock").length).toBe(1);
    expect(screen.getAllByText("Nilai Persediaan").length).toBeGreaterThanOrEqual(1);
  });

  it("merender 14 aktivitas terkini dengan format tanggal id-ID", async () => {
    const { container } = render(<DashboardView />);

    await waitFor(() => expect(container.querySelector("ol")).toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(container.querySelectorAll("ol li")).toHaveLength(activities.length);
    expect(activities).toHaveLength(14);

    const first = activities[0]!;
    expect(screen.getByText(`${first.type} · ${first.no}`)).toBeInTheDocument();
    expect(
      screen.getByText(`${first.warehouse} — ${formatNumber(first.qty)} unit oleh ${first.pic}`),
    ).toBeInTheDocument();

    const expectedDate = new Date(first.date).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
    });
    expect(screen.getAllByText(expectedDate).length).toBeGreaterThanOrEqual(1);
  });

  it("merender hanya sesi opname Berjalan dengan progress", async () => {
    const { container } = render(<DashboardView />);

    await waitFor(() => expect(screen.getAllByRole("progressbar")).toHaveLength(2), {
      timeout: 3000,
    });

    const running = opnameFixture.filter((o) => o.status === "Draft");
    expect(running).toHaveLength(2);

    for (const s of running) {
      expect(screen.getAllByText(s.warehouse).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(`${s.checked_count}/${s.line_count}`)).toBeInTheDocument();
    }

    for (const o of opnameFixture.filter((x) => x.status !== "Draft")) {
      expect(screen.queryByText(`${o.checked_count}/${o.line_count}`)).toBeNull();
    }

    const bars = screen.getAllByRole("progressbar");
    const indicator = bars[0]?.querySelector("div") as HTMLElement | null;
    const style = indicator?.getAttribute("style") ?? "";
    const transform = style.match(/translateX\(-?([\d.]+)%\)/);
    expect(transform).not.toBeNull();
    expect(Number(transform?.[1])).toBeCloseTo(
      100 - (running[0]!.checked_count / running[0]!.line_count) * 100,
      2,
    );
  });

  it("merender hingga 6 item stok menipis sebagai link ke halaman barang", async () => {
    const { container } = render(<DashboardView />);

    await waitFor(
      () =>
        expect(
          container.querySelectorAll('a[data-to="/master/barang/$id"]').length,
        ).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    const links = container.querySelectorAll('a[data-to="/master/barang/$id"]');
    expect(links.length).toBe(Math.min(6, lowStock.length));

    const first = lowStock[0]!;
    const firstLink = links[0] as HTMLElement;
    const params = JSON.parse(firstLink.getAttribute("data-params") ?? "{}") as { id?: string };
    expect(params.id).toBe(first.id);

    expect(screen.getAllByText(first.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(`${first.stock}/${first.min} ${first.unit}`)).toBeInTheDocument();
  });
});
