<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $item = $this->route('item');

        return [
            'sku' => ['required', 'string', 'max:30', Rule::unique('items', 'sku')->ignore($item)],
            'barcode' => ['nullable', 'string', 'max:30', Rule::unique('items', 'barcode')->ignore($item)],
            'internal_barcode' => ['nullable', 'string', 'max:30', Rule::unique('items', 'internal_barcode')->ignore($item)],
            'name' => ['required', 'string', 'max:200'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'sub_category_id' => ['nullable', 'integer', Rule::exists('sub_categories', 'id')->where(
                fn ($q) => $q->where('category_id', $this->input('category_id'))
            )],
            'brand_id' => ['nullable', 'integer', 'exists:merks,id'],
            'unit_id' => ['nullable', 'integer', 'exists:units,id'],
            'preferred_supplier_id' => ['nullable', 'string', 'max:20'],
            'default_warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'default_rack_id' => ['nullable', 'string', 'max:20'],
            'default_bin_id' => ['nullable', 'string', 'max:20'],
            'weight' => ['nullable', 'numeric', 'min:0'],
            'dimension' => ['nullable', 'string', 'max:60'],
            'cost' => ['required', 'numeric', 'min:0'],
            'price' => ['required', 'numeric', 'min:0'],
            'min_stock' => ['required', 'integer', 'min:0'],
            'max_stock' => ['nullable', 'integer', 'min:0', 'gte:min_stock'],
            'lead_time' => ['nullable', 'integer', 'min:0'],
            'stock' => ['sometimes', 'integer', 'min:0'],
            'reserved' => ['sometimes', 'integer', 'min:0'],
            'status' => ['required', Rule::in(['Aktif', 'Nonaktif'])],
            'image_url' => ['nullable', 'url'],
        ];
    }
}
