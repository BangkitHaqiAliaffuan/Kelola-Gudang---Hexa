<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class LaporanKeluarAnalyticsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            // Filter satu tujuan spesifik (eksklusif, cerminan aturan store).
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            // Saring klasifikasi tujuan hasil resolusi server.
            'jenis_tujuan' => ['nullable', Rule::in(['customer', 'departemen', 'proyek', 'lainnya'])],
            // Ambang hari tanpa order agar tujuan dicap at-risk (default 90).
            'at_risk_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            // Band toleransi varians serapan proyek vs target WO, persen (default 5).
            'variance_band' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }
}
