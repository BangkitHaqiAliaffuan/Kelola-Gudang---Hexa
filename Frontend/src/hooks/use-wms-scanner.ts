import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { findMatchesByCode, MATCH_SOURCE_LABEL, type MatchSource } from "@/lib/barcode-label";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { ItemApi } from "@/lib/master-types";

type ScanItem = Pick<ItemApi, "id" | "sku" | "barcode" | "internal_barcode" | "name">;

export type ScanMatch = { item: ScanItem; source: MatchSource };

type UseWmsScannerOptions = {
  items: ScanItem[];
  onPick: (item: Pick<ItemApi, "id" | "name">) => void;
  /**
   * Dipanggil bila satu kode cocok dengan >1 barang (barcode kemasan bersama).
   * Bila tidak diisi, fallback ke perilaku lama: pilih cocok pertama.
   */
  onAmbiguous?: (code: string, matches: ScanMatch[]) => void;
  readerId?: string;
};

export function useWmsScanner({
  items,
  onPick,
  onAmbiguous,
  readerId = "wms-reader",
}: UseWmsScannerOptions) {
  const [scanOpen, setScanOpen] = useState(false);
  const scannerRef = useRef<InstanceType<(typeof import("html5-qrcode"))["Html5Qrcode"]> | null>(
    null,
  );
  const scanHandledRef = useRef(false);
  const onAmbiguousRef = useRef(onAmbiguous);
  useEffect(() => {
    onAmbiguousRef.current = onAmbiguous;
  }, [onAmbiguous]);

  /**
   * Resolusi satu hasil scan (dipakai wedge fisik maupun kamera):
   * 0 cocok → error; 1 cocok → pilih + toast sumber; >1 → dialog disambiguasi
   * (atau cocok pertama bila caller belum menyediakan onAmbiguous).
   */
  const resolveScan = useCallback(
    (code: string): boolean => {
      if (!items.length) {
        toast.error("Data barang belum siap — coba lagi sesaat");
        return false;
      }
      const matches = findMatchesByCode(items, code);
      if (matches.length === 0) {
        toast.error(`Barang tidak ditemukan: ${code.trim()}`);
        return false;
      }
      if (matches.length > 1 && onAmbiguousRef.current) {
        onAmbiguousRef.current(code, matches);
        return true;
      }
      const first = matches[0]!;
      onPick(first.item as unknown as Pick<ItemApi, "id" | "name">);
      toast.success(
        `Terpilih: ${(first.item as unknown as { name: string }).name} (${MATCH_SOURCE_LABEL[first.source]})`,
      );
      return true;
    },
    [items, onPick],
  );

  useBarcodeScanner({ onScan: resolveScan, enabled: !scanOpen });

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
            if (resolveScan(decodedText)) {
              scanHandledRef.current = true;
              setScanOpen(false);
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
  }, [scanOpen, items, stopScanner, resolveScan, readerId]);

  return { scanOpen, setScanOpen, readerId };
}
