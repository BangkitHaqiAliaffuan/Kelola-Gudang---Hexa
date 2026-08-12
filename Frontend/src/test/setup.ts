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
    this.callback([{ contentRect: { width: CHART_WIDTH, height: CHART_HEIGHT } } as ResizeObserverEntry], this);
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
