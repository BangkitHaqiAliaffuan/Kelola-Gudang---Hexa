<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'name' => $this->resource['name'],
            'user_count' => $this->resource['user_count'],
            'active_user_count' => $this->resource['active_user_count'],
            'access' => $this->resource['access'],
        ];
    }
}
