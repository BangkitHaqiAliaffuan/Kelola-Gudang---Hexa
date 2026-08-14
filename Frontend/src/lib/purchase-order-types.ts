// Types mirroring the Laravel Pengadaan API for Purchase Order (ProcDoc kind=PO).
// Self-contained for now; will be folded into the shared pengadaan-types.ts once
// the Purchase Request frontend scaffolding lands (see Frontend/AGENTS.md).

export type ProcDocKind = "PR" | "PO" | "GR";

export const poStatuses = [
  "Draft",
  "Menunggu Approval",
  "Disetujui",
  "Ditolak",
  "Sebagian Diterima",
  "Selesai",
  "Dibatalkan",
] as const;

export type PoStatus = (typeof poStatuses)[number];

export type ProcDocLineApi = {
  id: number;
  proc_doc_id: number;
  line_no: number;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit_id: number | null;
  unit: string | null;
  qty: number;
  price: number;
  subtotal: number;
};

export type ProcDocApprovalApi = {
  id: number;
  level: number;
  status: string;
  approver_user_id: number | null;
  approver: string | null;
  decision_note: string | null;
  decided_at: string | null;
};

export type ProcDocApi = {
  id: number;
  no: string;
  kind: ProcDocKind;
  status: string;
  date: string | null;
  document_date: string;
  need_date: string | null;
  requester_user_id: number | null;
  requester: string | null;
  approver_user_id: number | null;
  approver: string | null;
  department_id: number | null;
  department: string | null;
  supplier_id: number | null;
  supplier: string | null;
  warehouse_id: number | null;
  warehouse: string | null;
  reference: string | null;
  source_proc_doc_id: number | null;
  source_proc_doc: string | null;
  note: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  approvals?: ProcDocApprovalApi[];
  created_by: string | null;
  line_count: number | null;
  qty_total: number | null;
  value_total: number | null;
  lines?: ProcDocLineApi[];
};

export type ProcDocLinePayload = {
  item_id: number;
  qty: number;
  unit_id?: number | null;
  price: number;
};

export type ProcDocPayload = {
  kind: "PO";
  document_date: string;
  need_date: string;
  department_id?: number | null;
  supplier_id: number;
  warehouse_id: number;
  reference?: string | null;
  source_proc_doc_id?: number | null;
  note?: string | null;
  lines: ProcDocLinePayload[];
};
