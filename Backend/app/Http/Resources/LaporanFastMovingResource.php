<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LaporanFastMovingResource extends JsonResource
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
            'category_id' => $this->category_id,
            'min' => $this->min_stock,
            'max' => $this->max_stock,
            'lead_time' => $this->lead_time,
            'cost' => $this->cost,
            'keluar_qty' => (int) $this->keluar_qty,
            'frekuensi' => (int) $this->frekuensi,
            'nilai_keluar' => (float) $this->nilai_keluar,
            'unit_cost_avg_keluar' => (float) $this->unit_cost_avg_keluar,
            'adu' => (float) $this->adu,
            'days_of_cover' => $this->days_of_cover,
            'tersedia' => (int) $this->tersedia,
            'reserved' => (int) $this->reserved,
            'prev_qty' => (int) $this->prev_qty,
            'trend_pct' => $this->trend_pct,
            'butuh_reorder' => (bool) $this->butuh_reorder,
            'risiko' => $this->risiko,
        ];
    }
}
