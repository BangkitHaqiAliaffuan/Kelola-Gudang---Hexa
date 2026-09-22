import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Trash2, Warehouse, ShieldAlert } from "lucide-react";

import { AiChatView } from "@/components/wms/ai-chat-view";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCopilot } from "@/hooks/use-copilot";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — KelolaGudang" },
      { name: "description", content: "Tanya jawab gudang dan susun usulan dokumen stok." },
      { property: "og:title", content: "AI Assistant — KelolaGudang" },
    ],
  }),
  component: AiAssistantPage,
});

/**
 * Halaman penuh AI Assistant.
 * Memakai AiChatView bersama dengan panel mengambang (satu sumber data hook useCopilot).
 * Dilengkapi status model AI, indikator cakupan gudang, dan konfirmasi pembersihan riwayat.
 */
function AiAssistantPage() {
  const copilot = useCopilot();
  const { warehouseScope } = useAuth();
  const [confirmClear, setConfirmClear] = useState(false);

  // Status AI diambil hanya saat dibuka (konvensi useCopilot).
  useEffect(() => {
    copilot.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = copilot.status.data;
  const isOnline = status?.enabled && status?.available;
  const provider = status?.provider ? status.provider.toUpperCase() : "AI ENGINE";
  const isLimitedWarehouse = warehouseScope?.mode === "Terbatas";

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-5xl flex-col gap-3 min-h-[550px] supports-[height:calc(100dvh-8.5rem)]:h-[calc(100dvh-8.5rem)]">
      {/* Header bar halaman AI */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              AI Assistant
            </h1>
            {/* Status koneksi AI */}
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Siap · {provider}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldAlert className="h-3 w-3" />
                Nonaktif
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tanya jawab stok & analitik, susun draft mutasi — setiap eksekusi selalu butuh
            konfirmasi Anda.
          </p>
        </div>

        {/* Info cakupan: teks inline, bukan chip — chip tunggal anti-pattern */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            title="AI hanya memiliki akses ke gudang yang diizinkan untuk akun Anda"
          >
            <Warehouse className="h-3.5 w-3.5 text-primary" />
            <span>Cakupan: {isLimitedWarehouse ? "Gudang Terbatas" : "Semua Gudang"}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => setConfirmClear(true)}
            disabled={
              copilot.chat.isPending ||
              copilot.execute.isPending ||
              (copilot.turns.length === 0 && copilot.pending.length === 0)
            }
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Bersihkan Chat</span>
          </Button>
        </div>
      </div>

      {/* Main chat workspace */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3.5 shadow-xs">
        <AiChatView copilot={copilot} variant="page" />
      </div>

      {/* Dialog konfirmasi hapus riwayat */}
      <AlertDialog open={confirmClear} onOpenChange={(o) => !o && setConfirmClear(false)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus riwayat percakapan?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh riwayat chat dan usulan dokumen yang belum dikonfirmasi pada sesi ini akan
              dibersihkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                copilot.clear();
                setConfirmClear(false);
              }}
            >
              Ya, bersihkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
