<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'no' => $this->no,
            'project_id' => $this->project_id,
            'project' => $this->whenLoaded('project', fn () => $this->project?->name),
            'item_id' => $this->item_id,
            'item' => $this->whenLoaded('item', fn () => $this->item?->name),
            'unit_id' => $this->unit_id,
            'unit' => $this->whenLoaded('unit', fn () => $this->unit?->name),
            'target_qty' => $this->target_qty,
            'start_date' => $this->start_date?->format('Y-m-d'),
            'finish_date' => $this->finish_date?->format('Y-m-d'),
            'pic_user_id' => $this->pic_user_id,
            'pic' => $this->whenLoaded('pic', fn () => $this->pic?->name),
            'status' => $this->status,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
