import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormattedMessage } from "./ai-chat-view";

/**
 * Preferensi gerak pengguna yang reaktif (SSR-aman): baca sekali saat mount,
 * lalu ikuti perubahan toggle OS selama tab terbuka.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export interface AiTypewriterProps {
  /** Teks lengkap yang akan ditampilkan secara bertahap. */
  text: string;
  /** Apakah animasi mengetik aktif (hanya untuk pesan asisten baru). */
  enabled?: boolean;
  /** Callback saat pengetikan selesai. */
  onComplete?: () => void;
  /** Callback saat teks bertambah (cocok untuk memicu scroll halus). */
  onTick?: (currentText: string) => void;
  /** Custom renderer untuk teks yang sudah terketik (default: FormattedMessage). */
  renderContent?: (visibleText: string) => ReactNode;
  /** Class styling untuk wrapper. */
  className?: string;
}

/**
 * Komponen animasi mengetik (typewriter effect) untuk pesan Asisten AI.
 * Menghadirkan efek respons real-time yang halus, adaptif terhadap panjang teks,
 * dan ramah aksesibilitas (menghormati prefers-reduced-motion).
 */
export function AiTypewriter({
  text,
  enabled = true,
  onComplete,
  onTick,
  renderContent,
  className,
}: AiTypewriterProps) {
  const isReducedMotion = useReducedMotion();

  // Jika animasi dinonaktifkan atau user memilih reduced motion, langsung tampilkan penuh
  const shouldAnimate = enabled && !isReducedMotion && text.length > 0;

  const [visibleLength, setVisibleLength] = useState<number>(shouldAnimate ? 0 : text.length);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!shouldAnimate) {
      setVisibleLength(text.length);
      onCompleteRef.current?.();
      return;
    }

    // Reset posisi saat text baru mulai dianimasikan
    setVisibleLength(0);

    // Hitung step karakter per tick agar jawaban panjang tidak lambat
    // Target durasi total: ~600ms s/d ~1800ms
    const totalChars = text.length;
    let step = 1;
    if (totalChars > 600) {
      step = 6;
    } else if (totalChars > 300) {
      step = 4;
    } else if (totalChars > 120) {
      step = 2;
    }

    const intervalMs = 16; // ~60fps cadence
    let current = 0;

    const timer = window.setInterval(() => {
      current = Math.min(current + step, totalChars);
      setVisibleLength(current);
      onTickRef.current?.(text.slice(0, current));

      if (current >= totalChars) {
        window.clearInterval(timer);
        onCompleteRef.current?.();
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [text, shouldAnimate]);

  const isTyping = shouldAnimate && visibleLength < text.length;
  const visibleText = isTyping ? text.slice(0, visibleLength) : text;

  // Izinkan user mengklik untuk langsung menyelesaikan animasi (skip)
  const handleSkip = () => {
    if (isTyping) {
      setVisibleLength(text.length);
      onCompleteRef.current?.();
    }
  };

  return (
    <div
      className={className}
      onClick={handleSkip}
      role={isTyping ? "button" : undefined}
      tabIndex={isTyping ? 0 : undefined}
      title={isTyping ? "Klik untuk mempercepat" : undefined}
      onKeyDown={(e) => {
        if (isTyping && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleSkip();
        }
      }}
    >
      {renderContent ? (
        <span aria-hidden={isTyping ? true : undefined}>{renderContent(visibleText)}</span>
      ) : (
        <span aria-hidden={isTyping ? true : undefined}>
          <FormattedMessage text={visibleText} />
        </span>
      )}
      {isTyping && (
        <>
          <span className="sr-only">{text}</span>
          <span
            className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-xs bg-primary align-middle"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
