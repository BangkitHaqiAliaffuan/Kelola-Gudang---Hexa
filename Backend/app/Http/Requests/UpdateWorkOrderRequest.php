<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateWorkOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $workOrder = $this->route('work_order');

        return [
            'no' => ['nullable', 'string', 'max:30', Rule::unique('work_orders', 'no')->ignore($workOrder)],
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'unit_id' => ['nullable', 'integer', 'exists:units,id'],
            'target_qty' => ['required', 'integer', 'min:1'],
            'start_date' => ['nullable', 'date', 'date_format:Y-m-d'],
            'finish_date' => ['nullable', 'date', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'pic_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'status' => ['sometimes', Rule::in(['Perencanaan', 'Berjalan', 'Selesai', 'Ditunda'])],
        ];
    }
}
