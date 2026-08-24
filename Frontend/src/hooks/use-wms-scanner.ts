import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { findItemByCode } from "@/lib/barcode-label";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { ItemApi } from "@/lib/master-types";

type UseWmsScannerOptions = {
  items: Pick<ItemApi, "id" | "sku" | "barcode" | "internal_barcode" | "name">[];
  onPick: (item: Pick<ItemApi, "id" | "name">) => void;
  readerId?: string;
};

export function useWmsScanner({ items, onPick, readerId = "wms-reader" }: UseWmsScannerOptions) {
  const [scanOpen, setScanOpen] = useState(false);
  const scannerRef = useRef<InstanceType<(typeof import("html5-qrcode"))["Html5Qrcode"]> | null>(null);
  const scanHandledRef = useRef(false);

  const handleHardwareScan = useCallback(
    (code: string) => {
      if (!items.length) {
        toast.error("Data barang belum siap — coba lagi sesaat");
        return;
      }
      const found = findItemByCode(items, code);
      if (found) {
        onPick(found as unknown as Pick<ItemApi, "id" | "name">);
        toast.success(`Terpilih: ${(found as unknown as { name: string }).name}`);
      } else {
        toast.error(`Barang tidak ditemukan: ${code.trim()}`);
      }
    },
    [items, onPick],
  );

  useBarcodeScanner({ onScan: handleHardwareScan, enabled: !scanOpen });

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      const state = (scanner as unknown as { getState?: () => number }).getState?.();
      if (state === undefined || state === 2) {
        await scanner.stop();
      }
    } catch {
      // ignore
    }
    try {
      if (document.getElementById(readerId)) {
        await scanner.clear();
      }
    } catch {
      // ignore
    }
  }, [readerId]);

  useEffect(() => {
    if (!scanOpen) {
      void stopScanner();
      scanHandledRef.current = false;
      return;
    }
    let cancelled = false;
    scanHandledRef.current = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled || !scanOpen) return;
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
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 400, height: 200 }, aspectRatio: 1.33, disableFlip: false },
          (decodedText) => {
            if (scanHandledRef.current) return;
            const found = findItemByCode(items, decodedText);
            if (found) {
              scanHandledRef.current = true;
              onPick(found as unknown as Pick<ItemApi, "id" | "name">);
              toast.success(`Terpilih: ${(found as unknown as { name: string }).name}`);
              setScanOpen(false);
            } else {
              toast.error(`Barang tidak ditemukan: ${decodedText.trim()}`);
            }
          },
          () => undefined,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          toast.error("Izin kamera ditolak — aktifkan di pengaturan browser");
        } else if (!msg.includes("not found")) {
          toast.error(`Gagal membuka kamera: ${msg}`);
        }
      }
    })();
    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [scanOpen, items, stopScanner]);

  return { scanOpen, setScanOpen, readerId };
}
