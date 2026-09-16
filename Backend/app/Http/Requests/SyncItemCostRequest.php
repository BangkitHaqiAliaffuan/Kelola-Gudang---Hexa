<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesModule;
use Illuminate\Foundation\Http\FormRequest;

class SyncItemCostRequest extends FormRequest
{
    use AuthorizesModule;

    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:items,id'],
        ];
    }
}
