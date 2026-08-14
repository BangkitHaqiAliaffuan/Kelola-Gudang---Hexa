<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RescheduleProcDocRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'need_date' => ['required', 'date', 'after_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'need_date.required' => 'Tanggal kebutuhan baru wajib diisi.',
            'need_date.date' => 'Tanggal kebutuhan baru tidak valid.',
            'need_date.after_or_equal' => 'Tanggal kebutuhan baru harus hari ini atau setelahnya.',
        ];
    }
}
