import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

const CHART_WIDTH = 800;
const CHART_HEIGHT = 300;

class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    this.callback(
      [{ contentRect: { width: CHART_WIDTH, height: CHART_HEIGHT } } as ResizeObserverEntry],
      this,
    );
  }

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

Object.defineProperty(Element.prototype, "getBoundingClientRect", {
  writable: true,
  value: () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: CHART_WIDTH,
    bottom: CHART_HEIGHT,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    toJSON: () => ({}),
  }),
});

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== "function") {
  const store = new Map<string, string>();
  const storageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: storageMock, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storageMock, writable: true });
}
