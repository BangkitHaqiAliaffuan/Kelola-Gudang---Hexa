<?php

namespace App\Http\Requests;

use App\Rules\WarehouseInScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProcDocRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'document_date' => ['required', 'date'],
            'requester_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'department_id' => ['required', 'integer', Rule::exists('departments', 'id')],
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            // Wajib di-scope seperti StoreProcDocRequest: user Terbatas tidak boleh
            // memindahkan dokumen ke gudang di luar lingkupnya (ia akan "menghilang"
            // dari pandangannya sendiri karena ProcDoc memakai ScopesToWarehouse).
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id'), new WarehouseInScope],
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
