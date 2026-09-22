<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesModule;
use Illuminate\Foundation\Http\FormRequest;

class BulkItemDeleteRequest extends FormRequest
{
    // Defense-in-depth (F2): cerminkan gate middleware
    // `role.access:Master Data` — POST menuntut level Tulis.
    use AuthorizesModule;

    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:items,id'],
        ];
    }
}
