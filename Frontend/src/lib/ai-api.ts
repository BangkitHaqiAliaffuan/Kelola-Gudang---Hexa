import { api } from "@/lib/api";

/** Satu usulan aksi dari AI yang menunggu konfirmasi user (HITL). */
export type AiProposal = {
  id: number;
  tool: string;
  summary: string;
  risk: string;
  status: string;
  payload: Record<string, unknown> & { _preview?: AiProposalPreview };
  expires_at?: string | null;
};

/** Satu baris preview human-readable (diisi server di payload._preview). */
export type AiProposalPreviewLine = {
  item_id: number;
  item_name?: string | null;
  sku?: string | null;
  unit?: string | null;
  qty: number;
};

/** Metadata visual usulan (nama gudang/barang — bukan ID mentah). */
export type AiProposalPreview = {
  warehouse_name?: string | null;
  destination_warehouse_name?: string | null;
  lines?: AiProposalPreviewLine[];
};

/** Satu turn riwayat untuk konteks klarifikasi multi-turn (maks 10). */
export type AiChatTurn = { role: "user" | "assistant"; text: string };

export type AiChatResult = {
  message: string;
  proposals: AiProposal[];
  tool_results: Array<{ tool: string; result: unknown }>;
  model: string;
};

export type AiStatus = {
  enabled: boolean;
  available: boolean;
  provider: string;
  daily_quota: number;
};

export type AiExecuteResult = {
  document_id?: number | null;
  no?: string | null;
  status?: string;
  message: string;
};

/** Endpoint AI Assistant (Backend routes/api.php, prefix /api/ai). */
export const aiApi = {
  status: () => api.get<{ data: AiStatus }>("/ai/status"),
  chat: (message: string, history?: AiChatTurn[]) =>
    api.post<{ data: AiChatResult }>("/ai/chat", {
      message,
      ...(history && history.length > 0 ? { history } : {}),
    }),
  execute: (proposalId: number, corrections?: Record<string, unknown>) =>
    api.post<{ data: AiExecuteResult }>("/ai/execute", {
      proposal_id: proposalId,
      ...(corrections ? { corrections } : {}),
    }),
  reject: (proposalId: number) =>
    api.post<{ data: { status: string } }>("/ai/reject", { proposal_id: proposalId }),
};
