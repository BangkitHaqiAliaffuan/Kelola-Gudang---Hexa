<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class BulkItemStatusRequest extends BulkItemDeleteRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'status' => ['required', Rule::in(['Aktif', 'Nonaktif'])],
        ]);
    }
}
