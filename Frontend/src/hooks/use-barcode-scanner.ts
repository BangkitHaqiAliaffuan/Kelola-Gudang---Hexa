import { useEffect, useRef } from "react";

type UseBarcodeScannerOptions = {
  /** Dipanggil saat burst scan terdeteksi. */
  onScan: (code: string) => void;
  /** Nonaktifkan listener (mis. saat dialog kamera terbuka). */
  enabled?: boolean;
  /** Panjang minimal agar dianggap scan valid. */
  minLength?: number;
  /** Jeda antar karakter yang menandakan manual typing (> threshold = reset). */
  thresholdMs?: number;
  /** Jeda tanpa input sebelum buffer di-flush (scanner tanpa Enter). */
  timeoutMs?: number;
};

/**
 * Deteksi scanner fisik (keyboard wedge): scanner mengirim karakter sangat cepat
 * (<thresholdMs antar ketukan) diakhiri Enter atau jeda. Hook ini memanggil onScan
 * hanya untuk burst tersebut, sehingga ketik manual lambat tidak terpicu.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  thresholdMs = 60,
  timeoutMs = 120,
}: UseBarcodeScannerOptions): void {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let buffer = "";
    let lastTime = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      buffer = "";
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const flush = () => {
      const code = buffer.trim();
      reset();
      if (code.length >= minLength) onScanRef.current(code);
    };

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          // Scanner wedge biasanya mengakhiri dengan Enter — cegah submit form.
          e.preventDefault();
          flush();
        } else {
          reset();
        }
        return;
      }

      // Abaikan tombol non-printable (Shift, Arrow, dll).
      if (e.key.length !== 1) return;

      const now = Date.now();
      if (buffer && now - lastTime > thresholdMs) {
        // Jeda terlalu lama → ketik manual, bukan burst scanner.
        reset();
      }
      buffer += e.key;
      lastTime = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (buffer.trim().length >= minLength) flush();
        else reset();
      }, timeoutMs);
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, minLength, thresholdMs, timeoutMs]);
}
