// ---- Purchase Request (GET/POST /api/pengadaan/proc-docs) ----
// Dokumen permintaan pembelian (PR) dari departemen sebelum diterbitkan PO.
// Kind lain (PO/GR) dipersiapkan di backend (PROC_DOC) tapi endpoint/UI saat
// ini khusus PR.

export const procDocStatuses = [
  "Draft",
  "Menunggu Approval",
  "Disetujui",
  "Ditolak",
  "Dibatalkan",
] as const;

export type ProcDocStatus = (typeof procDocStatuses)[number];

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

export type ProcDocApi = {
  id: number;
  no: string;
  kind: "PR" | "PO" | "GR";
  status: ProcDocStatus;
  date: string | null;
  document_date: string | null;
  need_date: string | null;
  requester_user_id: number | null;
  requester: string | null;
  department_id: number | null;
  department: string | null;
  supplier_id: number | null;
  supplier: string | null;
  warehouse_id: number | null;
  warehouse: string | null;
  reference: string | null;
  note: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  created_by: string | null;
  line_count?: number;
  qty_total?: number;
  value_total?: number;
  lines?: ProcDocLineApi[];
};

export type ProcDocLinePayload = {
  item_id: number;
  qty: number;
  unit_id: number | null;
  price: number;
};

export type ProcDocPayload = {
  kind: "PR";
  document_date: string;
  need_date: string | null;
  requester_user_id: number | null;
  department_id: number;
  supplier_id: number;
  warehouse_id: number;
  reference: string | null;
  note: string | null;
  lines: ProcDocLinePayload[];
};
