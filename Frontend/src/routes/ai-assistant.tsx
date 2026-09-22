import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Warehouse,
  ShieldAlert,
  X,
} from "lucide-react";

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
 * Memakai AiChatView bersama dengan panel mengambang. Daftar sesi chat
 * (localStorage per-user) dikelola di sini; panel hanya memakai sesi aktif.
 * Dilengkapi status model AI, indikator cakupan gudang, dan konfirmasi pembersihan riwayat.
 */
function AiAssistantPage() {
  const { user, warehouseScope } = useAuth();
  const copilot = useCopilot(user?.id ?? null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Status AI diambil hanya saat dibuka (konvensi useCopilot).
  useEffect(() => {
    copilot.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = copilot.status.data;
  const isOnline = status?.enabled && status?.available;
  const provider = status?.provider ? status.provider.toUpperCase() : "AI ENGINE";
  const isLimitedWarehouse = warehouseScope?.mode === "Terbatas";

  const activeTitle = copilot.sessions.find((s) => s.id === copilot.sessionId)?.title;
  const commitRename = () => {
    if (editingId != null) {
      copilot.renameSession(editingId, editDraft);
      setEditingId(null);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-6xl flex-col gap-3 min-h-[550px] supports-[height:calc(100dvh-8.5rem)]:h-[calc(100dvh-8.5rem)]">
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
            onClick={() => copilot.newSession()}
            disabled={copilot.chat.isPending || copilot.execute.isPending}
            title="Mulai percakapan baru (riwayat sesi ini tersimpan)"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Sesi baru</span>
          </Button>

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

      {/* Pemilih sesi (mobile): sidebar hanya tampil di layar sedang ke atas */}
      {copilot.sessions.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
          <span className="shrink-0">Sesi:</span>
          <select
            aria-label="Pilih sesi percakapan"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
            value={copilot.sessionId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new__") copilot.newSession();
              else copilot.switchSession(e.target.value);
            }}
          >
            {copilot.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value="__new__">+ Sesi baru…</option>
          </select>
        </label>
      )}

      {/* Main chat workspace + daftar sesi */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <aside
          aria-label="Daftar sesi percakapan"
          className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs md:flex"
        >
          <div className="border-b border-border px-3 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Sesi tersimpan · {copilot.sessions.length}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {copilot.sessions.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Belum ada sesi.</p>
            )}
            {[...copilot.sessions]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((s) => {
                const active = s.id === copilot.sessionId;
                return (
                  <div
                    key={s.id}
                    className={`group mb-1 rounded-xl border px-2 py-1.5 ${
                      active
                        ? "border-primary/40 bg-primary-soft"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    {editingId === s.id ? (
                      <input
                        autoFocus
                        aria-label="Nama sesi"
                        className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-xs"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={active ? `Sesi aktif ${s.title}` : `Buka sesi ${s.title}`}
                          className="min-w-0 flex-1 text-left"
                          onClick={() => copilot.switchSession(s.id)}
                          title={active ? activeTitle : `Buka ${s.title}`}
                        >
                          <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{s.title}</span>
                          </span>
                          <span className="mt-0.5 block pl-5 text-[10px] text-muted-foreground">
                            {new Date(s.updatedAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Ubah nama ${s.title}`}
                          className="rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background focus-visible:opacity-100"
                          onClick={() => {
                            setEditingId(s.id);
                            setEditDraft(s.title);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Hapus ${s.title}`}
                          className="rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-danger focus-visible:opacity-100"
                          onClick={() => copilot.deleteSession(s.id)}
                          disabled={copilot.chat.isPending || copilot.execute.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </aside>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3.5 shadow-xs">
          <AiChatView copilot={copilot} variant="page" />
        </div>
      </div>

      {/* Dialog konfirmasi hapus sesi aktif */}
      <AlertDialog open={confirmClear} onOpenChange={(o) => !o && setConfirmClear(false)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sesi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Riwayat chat dan usulan dokumen yang belum dikonfirmasi pada sesi ini akan
              dibersihkan. Sesi lain tidak terpengaruh.
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
