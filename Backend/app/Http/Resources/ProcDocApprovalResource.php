<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProcDocApprovalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'level' => $this->level,
            'status' => $this->status,
            'approver_user_id' => $this->approver_user_id,
            'approver' => $this->whenLoaded('approver', fn () => $this->approver?->name),
            'decision_note' => $this->decision_note,
            'decided_at' => $this->decided_at?->toIso8601String(),
        ];
    }
}