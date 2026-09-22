import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AiTypewriter } from "./ai-typewriter";

describe("AiTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("langsung merender seluruh teks bila enabled=false", () => {
    const onComplete = vi.fn();
    render(<AiTypewriter text="Halo dunia" enabled={false} onComplete={onComplete} />);

    expect(screen.getByText("Halo dunia")).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("mengetik secara bertahap saat enabled=true sampai selesai", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <AiTypewriter text="Halo dunia" enabled={true} onComplete={onComplete} />,
    );

    // Sebelum timer jalan, konten TERLIHAT belum lengkap (teks penuh hanya
    // ada di sr-only untuk screen reader).
    const visible = () => container.querySelector('span[aria-hidden="true"]')?.textContent ?? "";
    expect(visible()).not.toContain("Halo dunia");

    // Jalankan timer maju
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Halo dunia")).toBeTruthy();
    expect(onComplete).toHaveBeenCalled();
  });

  it("klik pada bubble mempercepat (skip) animasi hingga selesai", async () => {
    const onComplete = vi.fn();
    const { container } = render(
      <AiTypewriter
        text="Teks yang sangat panjang untuk dites"
        enabled={true}
        onComplete={onComplete}
      />,
    );

    // Sebelum skip, konten terlihat belum utuh
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).not.toContain(
      "Teks yang sangat panjang untuk dites",
    );

    // Trigger click untuk skip
    const wrapper = container.firstChild as HTMLElement;
    act(() => {
      wrapper.click();
    });

    expect(screen.getByText("Teks yang sangat panjang untuk dites")).toBeTruthy();
    expect(onComplete).toHaveBeenCalled();
  });

  it("langsung merender seluruh teks jika prefers-reduced-motion aktif", () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onComplete = vi.fn();
    render(<AiTypewriter text="Animasi dimatikan" enabled={true} onComplete={onComplete} />);

    expect(screen.getByText("Animasi dimatikan")).toBeTruthy();
    expect(onComplete).toHaveBeenCalled();

    window.matchMedia = origMatchMedia;
  });
});
