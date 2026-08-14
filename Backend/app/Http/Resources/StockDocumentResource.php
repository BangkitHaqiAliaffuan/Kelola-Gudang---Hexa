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
            'document_date' => $this->document_date?->toIso8601String(),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'destination_warehouse_id' => $this->destination_warehouse_id,
            'destination' => $this->whenLoaded('destination', fn () => $this->destination?->name),
            'source_document_id' => $this->source_document_id,
            'source_document' => $this->whenLoaded('sourceDocument', fn () => $this->sourceDocument?->no),
            'partner' => $this->partner,
            'reference_no' => $this->reference_no,
            'pic' => $this->pic,
            'note' => $this->note,
            'posted_at' => $this->posted_at?->toIso8601String(),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'line_count' => $this->whenCounted('lines'),
            'checked_count' => $this->when(isset($this->resource->checked_count), (int) $this->resource->checked_count),
            'qty_total' => $this->when(isset($this->resource->qty_total), (int) $this->resource->qty_total),
            'value_total' => $this->when(isset($this->resource->value_total), (float) $this->resource->value_total),
            'lines' => StockDocumentLineResource::collection($this->whenLoaded('lines')),
        ];
    }
}
