import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { templateDims, type LabelTemplate } from "@/lib/barcode-label";

export function LabelTemplateDialog({
  open,
  onOpenChange,
  draftSummary,
  draftError,
  onSave,
  custom,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ringkasan draft aktif, mis. "3×2 · margin 10 · gap 0". */
  draftSummary: string;
  draftError: string | null;
  onSave: (name: string) => string | null;
  custom: LabelTemplate[];
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = () => {
    const err = onSave(name);
    if (err) {
      setSaveError(err);
      return;
    }
    setName("");
    setSaveError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kelola Template</DialogTitle>
          <DialogDescription>
            Simpan susunan aktif ({draftSummary}) sebagai template milik Anda.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="template-name">Nama template</Label>
          <div className="flex gap-2">
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Label Rak 3×2"
              maxLength={40}
              className="rounded-xl"
            />
            <Button
              type="button"
              className="rounded-xl"
              disabled={draftError !== null}
              onClick={handleSave}
            >
              Simpan
            </Button>
          </div>
          {(saveError ?? draftError) && (
            <p className="text-xs text-destructive">{saveError ?? draftError}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Template milik saya ({custom.length})</Label>
          {custom.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada template custom.</p>
          ) : (
            custom.map((t) => {
              const d = templateDims(t);
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.cols}×{t.rows} · {d.wMm}×{d.hMm} mm · {d.perSheet}/lembar
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg text-destructive"
                    aria-label={`Hapus template ${t.name}`}
                    onClick={() => onRemove(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
