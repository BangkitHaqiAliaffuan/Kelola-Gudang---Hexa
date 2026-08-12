<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockValuationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'item_id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'unit' => $this->whenLoaded('unit', fn () => $this->unit?->name),
            'category' => $this->whenLoaded('category', fn () => $this->category?->name),
            'min' => $this->min_stock,
            'max' => $this->max_stock,
            'cost' => $this->cost,
            'stock' => (int) $this->stock,
            'reserved' => (int) $this->reserved,
            'available' => (int) $this->available,
            'unit_cost_fifo' => (float) $this->unit_cost_fifo,
            'unit_cost_avg' => (float) $this->unit_cost_avg,
            'unit_cost_max' => (float) $this->unit_cost_max,
            'nilai_fifo' => (float) $this->nilai_fifo,
            'nilai_avg' => (float) $this->nilai_avg,
            'nilai_max' => (float) $this->nilai_max,
            'last_move_at' => $this->last_move_at,
            'moving' => $this->moving,
        ];
    }
}
