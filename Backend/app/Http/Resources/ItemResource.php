<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'name' => $this->name,
            'category_id' => $this->category_id,
            'sub_category_id' => $this->sub_category_id,
            'brand_id' => $this->brand_id,
            'unit_id' => $this->unit_id,
            'default_warehouse_id' => $this->default_warehouse_id,
            'category' => $this->whenLoaded('category', fn () => $this->category?->name),
            'subCategory' => $this->whenLoaded('subCategory', fn () => $this->subCategory?->name),
            // Reference tables ship with later master-data phases — null until then.
            'brand' => $this->whenLoaded('brand', fn () => $this->brand?->name),
            'unit' => $this->whenLoaded('unit', fn () => $this->unit?->name),
            'warehouse' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'supplier' => null,
            'rack' => null,
            'bin' => null,
            'stock' => $this->stock,
            'reserved' => $this->reserved,
            'cost' => $this->cost,
            'price' => $this->price,
            'min' => $this->min_stock,
            'max' => $this->max_stock,
            'weight' => $this->weight,
            'dimension' => $this->dimension,
            'leadTime' => $this->lead_time,
            'status' => $this->status,
            'image_url' => $this->image_url,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
