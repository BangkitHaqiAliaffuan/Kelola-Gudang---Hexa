import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ScannerInstance = {
  start: (
    config: unknown,
    options: unknown,
    onSuccess: (text: string) => void,
    onFailure?: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
  getState?: () => number;
};

/**
 * Dialog scan barcode via kamera untuk form barang baru.
 *
 * Sengaja mandiri (tidak memakai useWmsScanner): hook itu menolak kode yang
 * belum ada di master ("Barang tidak ditemukan"), sedangkan di sini hasilnya
 * justru kode baru yang akan mengisi kolom barcode. Pola start/stop/error
 * kamera menyalin useWmsScanner yang sudah terbukti.
 */
export function BarcodeCameraDialog({
  open,
  onOpenChange,
  onDecode,
  readerId = "item-barcode-reader",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecode: (code: string) => void;
  readerId?: string;
}) {
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);
  const handledRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      const state = scanner.getState?.();
      if (state === undefined || state === 2) {
        await scanner.stop();
      }
    } catch {
      // abaikan — stream mungkin sudah mati
    }
    try {
      if (document.getElementById(readerId)) {
        await scanner.clear();
      }
    } catch {
      // abaikan
    }
  };

  useEffect(() => {
    if (!open) {
      void stopScanner();
      handledRef.current = false;
      setStatus("starting");
      setErrorMsg(null);
      return;
    }
    let cancelled = false;
    handledRef.current = false;
    setStatus("starting");
    setErrorMsg(null);
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled || !open) return;
        const scanner = new Html5Qrcode(readerId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
        }) as unknown as ScannerInstance;
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 400, height: 200 }, aspectRatio: 1.33, disableFlip: false },
          (decodedText) => {
            if (handledRef.current) return;
            const code = decodedText.trim();
            if (!code) return;
            handledRef.current = true;
            onDecodeRef.current(code);
            onOpenChange(false);
          },
          () => undefined,
        );
        if (!cancelled) setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setStatus("error");
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setErrorMsg(
            "Izin kamera ditolak — aktifkan izin kamera di pengaturan browser, lalu coba lagi.",
          );
        } else if (!msg.includes("not found")) {
          setErrorMsg(`Gagal membuka kamera: ${msg}`);
        } else {
          setErrorMsg("Kamera tidak ditemukan di perangkat ini.");
        }
      }
    })();
    return () => {
      cancelled = true;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, readerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Scan Barcode
          </DialogTitle>
          <DialogDescription>
            {status === "starting" && "Mengaktifkan kamera…"}
            {status === "scanning" && "Arahkan kamera ke barcode kemasan."}
            {status === "error" && "Kamera tidak dapat digunakan."}
          </DialogDescription>
        </DialogHeader>
        <div
          id={readerId}
          className="min-h-[280px] overflow-hidden rounded-xl border border-border bg-black"
        />
        {status === "starting" && (
          <p className="flex items-center gap-2 text-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Menunggu izin kamera…
          </p>
        )}
        {status === "error" && errorMsg && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMsg}
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
