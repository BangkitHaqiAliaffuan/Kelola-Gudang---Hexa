import { beforeEach, describe, expect, it } from "vitest";

import {
  COPILOT_GEOM_KEY,
  PANEL_MIN_H,
  PANEL_MIN_W,
  clampGeometry,
  clearGeometry,
  loadGeometry,
  saveGeometry,
  type PanelGeometry,
} from "./copilot-geometry";

const BASE: PanelGeometry = { x: 100, y: 100, w: 400, h: 500 };

describe("clampGeometry", () => {
  it("melewatkan geometri valid tanpa perubahan", () => {
    expect(clampGeometry(BASE, 1280, 800)).toEqual(BASE);
  });

  it("menjepit ukuran ke minimum dan viewport", () => {
    expect(clampGeometry({ x: 0, y: 0, w: 10, h: 10 }, 1280, 800)).toEqual({
      x: 0,
      y: 0,
      w: PANEL_MIN_W,
      h: PANEL_MIN_H,
    });
    expect(clampGeometry({ x: 0, y: 0, w: 2000, h: 2000 }, 1280, 800).w).toBeLessThanOrEqual(
      1280 - 32,
    );
  });

  it("menjaga minimal 80px terlihat di tiap sisi", () => {
    const c = clampGeometry({ x: -1000, y: -1000, w: 400, h: 500 }, 1280, 800);
    expect(c.x).toBe(80 - 400);
    expect(c.y).toBe(0);
    const d = clampGeometry({ x: 5000, y: 5000, w: 400, h: 500 }, 1280, 800);
    expect(d.x).toBe(1280 - 80);
    expect(d.y).toBe(800 - 80);
  });
});

describe("loadGeometry / saveGeometry / clearGeometry", () => {
  beforeEach(() => {
    window.localStorage.removeItem(COPILOT_GEOM_KEY);
  });

  it("roundtrip simpan → baca", () => {
    saveGeometry(BASE);
    expect(loadGeometry()).toEqual(BASE);
  });

  it("null untuk key kosong, JSON korup, atau bentuk salah", () => {
    expect(loadGeometry()).toBeNull();
    window.localStorage.setItem(COPILOT_GEOM_KEY, "{bukan-json");
    expect(loadGeometry()).toBeNull();
    window.localStorage.setItem(COPILOT_GEOM_KEY, JSON.stringify({ x: 1, y: 2 }));
    expect(loadGeometry()).toBeNull();
    window.localStorage.setItem(COPILOT_GEOM_KEY, JSON.stringify({ x: 1, y: 2, w: -5, h: 0 }));
    expect(loadGeometry()).toBeNull();
  });

  it("clear menghapus simpanan", () => {
    saveGeometry(BASE);
    clearGeometry();
    expect(loadGeometry()).toBeNull();
  });
});
