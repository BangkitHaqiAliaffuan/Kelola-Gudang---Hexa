<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesModule;
use Illuminate\Validation\Rule;

class BulkItemStatusRequest extends BulkItemDeleteRequest
{
    use AuthorizesModule;

    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'status' => ['required', Rule::in(['Aktif', 'Nonaktif'])],
        ]);
    }
}
