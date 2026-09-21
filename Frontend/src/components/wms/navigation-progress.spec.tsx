import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationProgress } from "./navigation-progress";

const handlers: Record<string, () => void> = {};
const unsubs: Array<() => void> = [];

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    subscribe: (event: string, fn: () => void) => {
      handlers[event] = fn;
      const unsub = vi.fn();
      unsubs.push(unsub);
      return unsub;
    },
  }),
}));

let rafCallbacks: Array<() => void> = [];

function bar() {
  return screen.getByRole("progressbar", { hidden: true });
}

function fire(event: "onBeforeNavigate" | "onResolved") {
  act(() => {
    handlers[event]?.();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function flushRaf() {
  act(() => {
    const pending = rafCallbacks;
    rafCallbacks = [];
    pending.forEach((cb) => cb());
  });
}

describe("NavigationProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    unsubs.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("berlangganan onBeforeNavigate + onResolved lalu berhenti saat unmount", () => {
    const { unmount } = render(<NavigationProgress />);
    expect(handlers["onBeforeNavigate"]).toBeTypeOf("function");
    expect(handlers["onResolved"]).toBeTypeOf("function");
    unmount();
    expect(unsubs).toHaveLength(2);
    unsubs.forEach((u) => expect(u).toHaveBeenCalledOnce());
  });

  it("tersembunyi di awal (SSR-safe)", () => {
    render(<NavigationProgress />);
    const progress = bar();
    expect(progress).toHaveAttribute("aria-label", "Memuat halaman");
    expect(progress.style.display).toBe("none");
  });

  it("tidak berkedip untuk navigasi cepat (<150ms)", () => {
    render(<NavigationProgress />);
    const fast = bar();
    fire("onBeforeNavigate");
    advance(149);
    expect(fast.style.display).toBe("none");
    fire("onResolved");
    advance(1000);
    expect(fast.style.display).toBe("none");
  });

  it("muncul setelah threshold lalu tuntas 100% dan menghilang", () => {
    render(<NavigationProgress />);
    const slow = bar();
    fire("onBeforeNavigate");
    advance(150);
    expect(slow.style.display).toBe("block");
    flushRaf();
    expect(slow.style.width).toBe("70%");

    fire("onResolved");
    expect(slow.style.width).toBe("100%");
    advance(400);
    expect(slow.style.opacity).toBe("0");
    advance(200);
    expect(slow.style.display).toBe("none");
    expect(slow.style.width).toBe("0%");
  });
});
