<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMinimumResource extends JsonResource
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
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),
            'min' => $this->min_stock,
            'max' => $this->max_stock,
            'cost' => $this->cost,
            'lead_time' => $this->lead_time,
            'total_stock' => (int) ($this->total_stock ?? 0),
            'reserved' => (int) ($this->total_reserved ?? 0),
            'available' => (int) $this->available,
            'avg_daily_usage' => (float) $this->avg_daily_usage,
            'days_of_cover' => $this->days_of_cover,
            'suggested_qty' => (int) $this->suggested_qty,
            'status' => $this->status,
        ];
    }
}