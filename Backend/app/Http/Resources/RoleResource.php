<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'name' => $this->resource->name,
            'description' => $this->resource->description,
            'is_system' => $this->resource->is_system,
            'can_review' => $this->resource->can_review,
            'user_count' => $this->resource->userCount(),
            'active_user_count' => $this->resource->activeUserCount(),
            'access' => $this->resource->access(),
        ];
    }
}
