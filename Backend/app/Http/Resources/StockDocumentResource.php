<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'no' => $this->no,
            'type' => $this->type,
            'status' => $this->status,
            'blind_count' => (bool) $this->blind_count,
            'document_date' => $this->document_date?->toIso8601String(),
            'frozen_at' => $this->frozen_at?->toIso8601String(),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'destination_warehouse_id' => $this->destination_warehouse_id,
            'destination' => $this->whenLoaded('destination', fn () => $this->destination?->name),
            'source_document_id' => $this->source_document_id,
            'source_document' => $this->whenLoaded('sourceDocument', fn () => $this->sourceDocument?->no),
            'customer_id' => $this->customer_id,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->name),
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'project_id' => $this->project_id,
            'project' => $this->whenLoaded('project', fn () => $this->project?->name),
            'partner' => $this->partner,
            'reference_no' => $this->reference_no,
            'pic' => $this->pic,
            'note' => $this->note,
            'posted_at' => $this->posted_at?->toIso8601String(),
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'requester_user_id' => $this->requester_user_id,
            'requester' => $this->whenLoaded('requester', fn () => $this->requester?->name),
            'approver_user_id' => $this->approver_user_id,
            'approver' => $this->whenLoaded('approver', fn () => $this->approver?->name),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'decision_note' => $this->decision_note,
            'locked_by_user_id' => $this->locked_by_user_id,
            'locked_by' => $this->whenLoaded('locker', fn () => $this->locker?->name),
            'locked_at' => $this->locked_at?->toIso8601String(),
            'is_locked_by_me' => $request->user() && (int) $this->locked_by_user_id === (int) $request->user()->id && $this->locked_at && $this->locked_at->gt(now()->subMinutes(10)),
            'line_count' => $this->whenCounted('lines'),
            'checked_count' => $this->when(isset($this->resource->checked_count), (int) $this->resource->checked_count),
            'qty_total' => $this->when(isset($this->resource->qty_total), (int) $this->resource->qty_total),
            'value_total' => $this->when(isset($this->resource->value_total), (float) $this->resource->value_total),
            'revenue_total' => $this->when(isset($this->resource->revenue_total), (float) $this->resource->revenue_total),
            'lines' => StockDocumentLineResource::collection($this->whenLoaded('lines')),
        ];
    }
}
