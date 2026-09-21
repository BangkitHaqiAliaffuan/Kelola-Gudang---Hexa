import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";

import { AiResultTables } from "@/components/wms/ai-result-table";
import { PageHeader, Panel } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

// TODO(F8.8): ganti body chat di bawah dengan AiChatView bersama hasil
// ekstraksi CopilotPanel (panel fullscreen dialihkan ke sini) — saat ini
// rendering pesan diduplikasi minimal agar page mandiri tanpa menyentuh
// copilot-panel.tsx (milik sesi lain, uncommitted).
function AiAssistantPage() {
  const copilot = useCopilot();
  const [draft, setDraft] = useState("");

  // Status AI diambil hanya saat dibuka (konvensi useCopilot).
  useEffect(() => {
    copilot.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aiOff = copilot.status.data && !copilot.status.data.enabled;
  const sending = copilot.chat.isPending;

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    copilot.send(text);
  };

  return (
    <div className="mx-auto flex max-h-full w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="AI Assistant"
        description="Tanya jawab stok, analitik, dan susun usulan dokumen — eksekusi selalu butuh konfirmasi Anda."
      />

      {aiOff === true && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            AI Assistant nonaktif di server (`AI_ENABLED=false`). Minta administrator
            mengaktifkannya untuk memakai halaman ini.
          </p>
        </Panel>
      )}

      {copilot.pending.length > 0 && (
        <Panel>
          <p className="mb-2 text-sm font-medium">Usulan menunggu konfirmasi</p>
          <div className="grid gap-2">
            {copilot.pending.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{p.summary || p.tool}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.tool} · risiko {p.risk}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-xl"
                    disabled={copilot.execute.isPending}
                    onClick={() => copilot.execute.mutate({ id: p.id })}
                  >
                    {copilot.execute.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Konfirmasi & Jalankan
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={copilot.reject.isPending}
                    onClick={() => copilot.reject.mutate(p.id)}
                  >
                    Batalkan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="flex min-h-[40vh] flex-1 flex-col">
        <div className="grid flex-1 content-start gap-3 overflow-y-auto">
          {copilot.turns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Mulai dengan pertanyaan, mis. “Stok baut di bawah minimum apa saja?” atau “Buatkan
              draft penerimaan 20 Baut L M8x30 di Gudang Bekasi”.
            </p>
          )}
          {copilot.turns.map((t) => (
            <div
              key={t.id}
              className={
                t.role === "user"
                  ? "ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[95%] rounded-xl bg-muted px-3 py-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.status === "failed" && (
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => copilot.retry(t.id)}
                >
                  Kirim ulang
                </button>
              )}
              {t.role === "assistant" && t.toolResults && t.toolResults.length > 0 && (
                <div className="mt-2">
                  <AiResultTables results={t.toolResults} />
                </div>
              )}
            </div>
          ))}
          {sending && <p className="text-sm text-muted-foreground">AI sedang menjawab…</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Tulis pertanyaan… (Enter kirim, Shift+Enter baris baru)"
            className="min-h-11 rounded-xl"
            rows={2}
          />
          <Button
            onClick={submit}
            disabled={!draft.trim() || sending}
            className="rounded-xl"
            aria-label="Kirim"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
