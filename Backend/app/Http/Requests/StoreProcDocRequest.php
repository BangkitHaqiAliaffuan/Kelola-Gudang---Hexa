<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProcDocRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(['PR'])],
            'document_date' => ['required', 'date'],
            'need_date' => ['required', 'date', 'after_or_equal:document_date'],
            'requester_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'department_id' => ['required', 'integer', Rule::exists('departments', 'id')],
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'reference' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            'lines.*.qty' => ['required', 'integer', 'min:1'],
            // unit_id opsional; controller meng-backfill dari item bila kosong.
            'lines.*.unit_id' => ['nullable', 'integer', Rule::exists('units', 'id')],
            'lines.*.price' => ['required', 'numeric', 'min:0'],
        ];
    }
}
