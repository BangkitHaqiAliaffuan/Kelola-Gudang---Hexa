<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockRowResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $item = $this->item;
        $max = $item?->max_stock;

        $status = match (true) {
            $this->stock === 0 => 'Habis',
            $item && $item->min_stock !== null && $this->stock <= $item->min_stock => 'Menipis',
            $max !== null && $this->stock >= $max => 'Overstock',
            default => 'Normal',
        };

        return [
            'id' => "{$this->item_id}-{$this->warehouse_id}-".($this->bin_id ?? 'NULL'),
            'item_id' => $this->item_id,
            'sku' => $item?->sku,
            'name' => $item?->name,
            'unit' => $item?->unit?->name,
            'min' => $item?->min_stock,
            'max' => $max,
            'cost' => $item?->cost,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->warehouse?->name,
            'rack' => $this->bin?->rack?->code,
            'bin' => $this->bin?->code,
            'bin_id' => $this->bin_id,
            'stock' => $this->stock,
            'reserved' => $this->reserved,
            'available' => max(0, $this->stock - $this->reserved),
            'unit_cost_avg' => $this->unit_cost_avg,
            'nilai' => $this->stock * ($item?->cost ?? 0),
            'status' => $status,
        ];
    }
}
