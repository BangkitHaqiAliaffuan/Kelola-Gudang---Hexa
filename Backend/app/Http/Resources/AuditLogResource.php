<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'occurred_at' => $this->occurred_at?->toIso8601String(),
            'user_id' => $this->user_id,
            'user_name' => $this->user_name,
            'role' => $this->role,
            'action' => $this->action,
            'module' => $this->module,
            'auditable' => $this->auditable_type,
            'auditable_id' => $this->auditable_id,
            'record_no' => $this->record_no,
            'old_values' => $this->old_values,
            'new_values' => $this->new_values,
            'ip_address' => $this->ip_address,
        ];
    }
}
