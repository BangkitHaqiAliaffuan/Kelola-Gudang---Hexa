import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

// Navigasi sepele (<150ms) tidak memicu bar — mencegah kedip tiap klik kecil.
const SHOW_DELAY_MS = 150;
// Jeda sebelum fade-out agar bar 100% sempat terlihat.
const HIDE_GRACE_MS = 400;

/**
 * Bilah progres tipis di tepi atas halaman selama perpindahan route.
 *
 * Memberi umpan balik instan saat klik link sidebar/bottom-nav/FAB: halaman
 * berat menunggu TanStack Query client-side (loop `fetchAll()` beruntun)
 * setelah route berganti, yang sebelumnya terlihat seperti "tidak terjadi
 * apa-apa". Bar dimanipulasi via DOM langsung (bukan React state) karena
 * update state di dalam transition bisa tertunda sampai navigasi selesai.
 */
export function NavigationProgress() {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clearPending = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };

    const reset = () => {
      bar.style.transition = "none";
      bar.style.display = "none";
      bar.style.width = "0%";
      bar.style.opacity = "1";
    };

    const show = () => {
      // Navigasi beruntun: batalkan hide yang tertunda, mulai ulang.
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      if (bar.style.display === "block") return;
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        bar.style.display = "block";
        bar.style.opacity = "1";
        if (reducedMotion) {
          bar.style.transition = "none";
          bar.style.width = "30%";
          return;
        }
        bar.style.transition = "none";
        bar.style.width = "0%";
        raf.current = requestAnimationFrame(() => {
          bar.style.transition = "width 10s cubic-bezier(0.1, 0.05, 0, 1)";
          bar.style.width = "70%";
        });
      }, SHOW_DELAY_MS);
    };

    const hide = () => {
      if (showTimer.current) {
        // Selesai sebelum threshold — bar tak pernah tampil, tanpa kedip.
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (bar.style.display !== "block") return;
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      if (reducedMotion) {
        reset();
        return;
      }
      bar.style.transition = "width 200ms ease-out";
      bar.style.width = "100%";
      hideTimer.current = setTimeout(() => {
        bar.style.transition = "opacity 200ms ease-out";
        bar.style.opacity = "0";
        hideTimer.current = setTimeout(reset, 200);
      }, HIDE_GRACE_MS);
    };

    const unsubNavigate = router.subscribe("onBeforeNavigate", show);
    const unsubResolved = router.subscribe("onResolved", hide);
    return () => {
      unsubNavigate();
      unsubResolved();
      clearPending();
    };
  }, [router]);

  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-label="Memuat halaman"
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed top-0 left-0 z-[200] h-[5px] bg-primary"
      style={{ display: "none", width: "0%" }}
    />
  );
}
