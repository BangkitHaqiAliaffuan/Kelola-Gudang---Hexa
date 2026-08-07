<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $project = $this->route('project');

        return [
            'code' => ['nullable', 'string', 'max:20', Rule::unique('projects', 'code')->ignore($project)],
            'name' => ['required', 'string', 'max:150', Rule::unique('projects', 'name')->ignore($project)],
            'pic_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'start_date' => ['nullable', 'date', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'status' => ['sometimes', Rule::in(['Perencanaan', 'Berjalan', 'Selesai'])],
            'budget' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
