<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransaksiAnalyticsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['Penerimaan', 'Transfer Gudang', 'Retur Pembelian', 'Retur Penjualan'])],
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            // Khusus Transfer Gudang: saring gudang tujuan.
            'destination_warehouse_id' => [
                'nullable',
                'integer',
                'exists:warehouses,id',
                Rule::prohibitedIf(fn () => $this->input('type') !== 'Transfer Gudang'),
            ],
            'at_risk_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ];
    }
}
