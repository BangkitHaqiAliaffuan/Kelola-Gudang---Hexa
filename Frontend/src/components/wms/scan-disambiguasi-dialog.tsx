import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MATCH_SOURCE_LABEL, type MatchSource } from "@/lib/barcode-label";
import type { ScanMatch } from "@/hooks/use-wms-scanner";

export type AmbiguousPick = { id: string | number; name: string };

type ScanDisambiguasiDialogProps = {
  open: boolean;
  /** Kode hasil scan yang ambigu (ditampilkan agar operator bisa cek fisik). */
  code?: string | undefined;
  matches: ScanMatch[];
  onPick: (item: AmbiguousPick) => void;
  onClose: () => void;
};

function sourceBadge(source: MatchSource): string {
  return MATCH_SOURCE_LABEL[source];
}

/**
 * Dialog pilihan saat satu kode barcode cocok dengan >1 barang
 * (barcode kemasan supplier yang dipakai bersama). Operator wajib memilih —
 * sistem tidak menebak.
 */
export function ScanDisambiguasiDialog({
  open,
  code,
  matches,
  onPick,
  onClose,
}: ScanDisambiguasiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Beberapa barang cocok</DialogTitle>
          <DialogDescription>
            Kode{" "}
            {code ? <span className="font-mono font-semibold">{code.trim()}</span> : "hasil scan"}{" "}
            dipakai {matches.length} barang. Pilih barang yang dimaksud.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {matches.map(({ item, source }) => (
            <Button
              key={String(item.id)}
              variant="outline"
              className="h-auto flex-col items-start gap-1 rounded-xl p-3 text-left"
              onClick={() =>
                onPick({ id: item.id, name: (item as unknown as { name: string }).name })
              }
            >
              <span className="flex w-full items-center gap-2 font-semibold">
                <Package className="h-4 w-4 shrink-0" />
                <span className="truncate">{(item as unknown as { name: string }).name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {item.sku} · cocok via {sourceBadge(source)}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
