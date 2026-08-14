<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProcDocResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'no' => $this->no,
            'kind' => $this->kind,
            'status' => $this->status,
            'date' => $this->document_date?->toIso8601String(),
            'document_date' => $this->document_date?->toIso8601String(),
            'requester_user_id' => $this->requester_user_id,
            'requester' => $this->whenLoaded('requester', fn () => $this->requester?->name),
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'source_proc_doc_id' => $this->source_proc_doc_id,
            'source_proc_doc' => $this->whenLoaded('sourceProcDoc', fn () => $this->sourceProcDoc?->no),
            'reference' => $this->reference,
            'note' => $this->note,
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'approver_user_id' => $this->approver_user_id,
            'approver' => $this->whenLoaded('activeApprover', fn () => $this->activeApprover?->name),
            'approved_by' => $this->whenLoaded('approver', fn () => $this->approver?->name),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'decision_note' => $this->decision_note,
            'approvals' => ProcDocApprovalResource::collection($this->whenLoaded('approvals')),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'line_count' => $this->whenCounted('lines'),
            'qty_total' => $this->when(isset($this->resource->qty_total), (int) $this->resource->qty_total),
            'value_total' => $this->when(isset($this->resource->value_total), (float) $this->resource->value_total),
            'lines' => ProcDocLineResource::collection($this->whenLoaded('lines')),
        ];
    }
}
