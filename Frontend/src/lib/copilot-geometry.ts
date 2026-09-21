/**
 * Geometri floating Copilot Panel (drag + resize, desktop saja).
 *
 * Modul murni tanpa dependensi DOM/React agar mudah diuji. Panel memakai
 * `left/top/width/height` eksplisit begitu user drag/resize pertama kali;
 * sebelumnya mengandalkan class Tailwind default (kanan-bawah, 400px).
 */
export type PanelGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const COPILOT_GEOM_KEY = "kg-copilot-geom";

/** Breakpoint desktop — selaras dengan `sm:` Tailwind (640px). */
export const COPILOT_DESKTOP_QUERY = "(min-width: 640px)";

export const PANEL_MIN_W = 320;
export const PANEL_MIN_H = 420;
/** Sisi panel minimum yang harus tetap terlihat agar selalu bisa di-grab. */
export const PANEL_MIN_VISIBLE = 80;
/** Ambang gerak pointer sebelum dianggap drag (mencegah geser 1px saat klik). */
export const DRAG_THRESHOLD_PX = 3;

/**
 * Jepit geometri ke dalam viewport. Ukuran dijepit ke [min, viewport-32];
 * posisi dijepit agar minimal PANEL_MIN_VISIBLE px tetap terlihat.
 */
export function clampGeometry(g: PanelGeometry, vw: number, vh: number): PanelGeometry {
  const w = Math.min(Math.max(Math.round(g.w), PANEL_MIN_W), Math.max(vw - 32, PANEL_MIN_W));
  const h = Math.min(Math.max(Math.round(g.h), PANEL_MIN_H), Math.max(vh - 32, PANEL_MIN_H));
  const x = Math.min(
    Math.max(Math.round(g.x), PANEL_MIN_VISIBLE - w),
    Math.max(vw - PANEL_MIN_VISIBLE, 0),
  );
  const y = Math.min(Math.max(Math.round(g.y), 0), Math.max(vh - PANEL_MIN_VISIBLE, 0));
  return { x, y, w, h };
}

function isValidGeometry(v: unknown): v is PanelGeometry {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    Number.isFinite(r["x"]) &&
    Number.isFinite(r["y"]) &&
    Number.isFinite(r["w"]) &&
    Number.isFinite(r["h"]) &&
    (r["w"] as number) > 0 &&
    (r["h"] as number) > 0
  );
}

/** Baca geometri tersimpan; `null` bila belum ada / korup / di luar browser. */
export function loadGeometry(): PanelGeometry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COPILOT_GEOM_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidGeometry(parsed)) return null;
    return { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}

/** Simpan geometri; gagal diam-diam bila storage tak tersedia. */
export function saveGeometry(g: PanelGeometry): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COPILOT_GEOM_KEY, JSON.stringify(g));
  } catch {
    /* abaikan (mode privat, kuota penuh) */
  }
}

/** Hapus geometri tersimpan (dipakai saat reset via double-click header). */
export function clearGeometry(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COPILOT_GEOM_KEY);
  } catch {
    /* abaikan */
  }
}
