<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RackResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'warehouse_id' => $this->warehouse_id,
            'warehouse_name' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),
            'code' => $this->code,
            'name' => $this->name,
            'is_active' => $this->is_active,
            'bin_count' => $this->whenCounted('bins'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
