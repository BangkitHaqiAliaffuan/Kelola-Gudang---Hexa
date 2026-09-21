import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { AiChatView } from "@/components/wms/ai-chat-view";
import { PageHeader } from "@/components/wms/kit";
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

// Halaman penuh AI Assistant — memakai AiChatView bersama dengan panel
// mengambang (satu sumber UI). Panel mengambang di-suppress di route ini
// (AppShell) agar tidak ada dua mount useCopilot yang berebut sessionStorage.
function AiAssistantPage() {
  const copilot = useCopilot();

  // Status AI diambil hanya saat dibuka (konvensi useCopilot).
  useEffect(() => {
    copilot.setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-h-full w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="AI Assistant"
        description="Tanya jawab stok, analitik, dan susun usulan dokumen — eksekusi selalu butuh konfirmasi Anda."
      />
      <div className="flex min-h-[60vh] flex-1 flex-col rounded-2xl border border-border bg-background p-4">
        <AiChatView copilot={copilot} variant="page" />
      </div>
    </div>
  );
}
