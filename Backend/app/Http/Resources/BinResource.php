<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BinResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'rack_id' => $this->rack_id,
            'rack_name' => $this->whenLoaded('rack', fn () => $this->rack?->name),
            'warehouse_name' => $this->whenLoaded('rack', fn () => $this->rack?->warehouse?->name),
            'code' => $this->code,
            'name' => $this->name,
            'is_active' => $this->is_active,
            'item_count' => $this->whenCounted('items'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
