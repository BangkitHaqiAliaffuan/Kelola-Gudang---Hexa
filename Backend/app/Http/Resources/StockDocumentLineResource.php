<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockDocumentLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'line_no' => $this->line_no,
            'item_id' => $this->item_id,
            'sku' => $this->whenLoaded('item', fn () => $this->item?->sku),
            'name' => $this->whenLoaded('item', fn () => $this->item?->name),
            'unit' => $this->whenLoaded('item', fn () => $this->item?->unit?->name),
            'qty' => $this->qty,
            'system_qty' => $this->system_qty,
            'actual_qty' => $this->actual_qty,
            'variance' => $this->system_qty !== null && $this->actual_qty !== null
                ? (int) $this->actual_qty - (int) $this->system_qty
                : null,
            'direction' => $this->whenLoaded('movement', fn () => $this->movement?->direction),
            'from_bin_id' => $this->from_bin_id,
            'from_bin' => $this->whenLoaded('fromBin', fn () => $this->fromBin?->code),
            'from_rack' => $this->whenLoaded('fromBin.rack', fn () => $this->fromBin?->rack?->code),
            'to_bin_id' => $this->to_bin_id,
            'to_bin' => $this->whenLoaded('toBin', fn () => $this->toBin?->code),
            'to_rack' => $this->whenLoaded('toBin.rack', fn () => $this->toBin?->rack?->code),
            'unit_cost' => $this->unit_cost,
            'note' => $this->note,
        ];
    }
}
