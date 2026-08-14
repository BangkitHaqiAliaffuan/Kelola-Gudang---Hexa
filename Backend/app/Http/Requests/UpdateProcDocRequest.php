<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProcDocRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'document_date' => ['required', 'date'],
            'need_date' => ['required', 'date', 'after_or_equal:document_date'],
            'requester_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'department_id' => ['required', 'integer', Rule::exists('departments', 'id')],
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'source_proc_doc_id' => ['nullable', 'integer', Rule::exists('proc_docs', 'id')->where(fn ($q) => $q->where('kind', 'PR')->where('status', 'Disetujui'))],
            'reference' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            'lines.*.qty' => ['required', 'integer', 'min:1'],
            'lines.*.unit_id' => ['nullable', 'integer', Rule::exists('units', 'id')],
            'lines.*.price' => ['required', 'numeric', 'min:0'],
        ];
    }
}
