<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LaporanMutasiResource extends JsonResource
{
    /**
     * @param Request $request
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->item_id ?? $this->resource->id,
            'item_id' => $this->resource->item_id ?? $this->resource->id,
            'sku' => $this->resource->sku,
            'name' => $this->resource->name,
            'unit' => $this->resource->unit?->name ?? $this->resource->unit_name ?? null,
            'category' => $this->resource->category?->name ?? $this->resource->category_name ?? null,
            'category_id' => $this->resource->category_id,
            'saldo_awal' => (int) ($this->resource->saldo_awal ?? 0),
            'masuk' => (int) ($this->resource->masuk ?? 0),
            'keluar' => (int) ($this->resource->keluar ?? 0),
            'saldo_akhir' => (int) ($this->resource->saldo_akhir ?? 0),
            'nilai_akhir' => (float) ($this->resource->nilai_akhir ?? 0),
            'unit_cost_avg' => (float) ($this->resource->unit_cost_avg ?? 0),
            'min_stock' => (int) ($this->resource->min_stock ?? 0),
            'max_stock' => isset($this->resource->max_stock) ? (int) $this->resource->max_stock : null,
        ];
    }
}
