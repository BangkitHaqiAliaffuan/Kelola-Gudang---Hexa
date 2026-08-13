<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProcDocLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'proc_doc_id' => $this->proc_doc_id,
            'line_no' => $this->line_no,
            'item_id' => $this->item_id,
            'sku' => $this->whenLoaded('item', fn () => $this->item?->sku),
            'name' => $this->whenLoaded('item', fn () => $this->item?->name),
            'unit_id' => $this->unit_id,
            'unit' => $this->whenLoaded('unit', fn () => $this->unit?->name),
            'qty' => $this->qty,
            'price' => (float) $this->price,
            'subtotal' => $this->subtotal(),
        ];
    }
}
