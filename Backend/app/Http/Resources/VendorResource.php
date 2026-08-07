<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VendorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'legal_name' => $this->legal_name,
            'nib' => $this->nib,
            'npwp' => $this->npwp,
            'service_type' => $this->service_type,
            'contact_phone' => $this->contact_phone,
            'email' => $this->email,
            'pic_name' => $this->pic_name,
            'website' => $this->website,
            'bank_name' => $this->bank_name,
            'bank_account_no' => $this->bank_account_no,
            'bank_account_name' => $this->bank_account_name,
            'verification_status' => $this->verification_status,
            'verification_note' => $this->verification_note,
            'verified_at' => $this->verified_at,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
