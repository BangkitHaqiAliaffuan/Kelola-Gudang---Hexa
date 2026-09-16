<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesModule;
use Illuminate\Foundation\Http\FormRequest;

class BulkItemImportRequest extends FormRequest
{
    use AuthorizesModule;

    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.sku' => ['nullable', 'string', 'max:30'],
            'items.*.barcode' => ['nullable', 'string', 'max:30'],
            'items.*.name' => ['required', 'string', 'max:200'],
            'items.*.category_id' => ['nullable', 'integer'],
            'items.*.category_name' => ['nullable', 'string', 'max:150'],
            'items.*.sub_category_id' => ['nullable', 'integer', 'exists:sub_categories,id'],
            'items.*.brand_id' => ['nullable', 'integer'],
            'items.*.brand_name' => ['nullable', 'string', 'max:150'],
            'items.*.unit_id' => ['nullable', 'integer'],
            'items.*.unit_name' => ['nullable', 'string', 'max:50'],
            'items.*.preferred_supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'items.*.default_warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'items.*.default_rack_id' => ['nullable', 'integer', 'exists:racks,id'],
            'items.*.default_bin_id' => ['nullable', 'integer', 'exists:bins,id'],
            'items.*.cost' => ['required', 'numeric', 'min:100'],
            'items.*.price' => ['required', 'numeric', 'min:100'],
            'items.*.min_stock' => ['required', 'integer', 'min:0'],
            'items.*.max_stock' => ['nullable', 'integer', 'min:0'],
            'items.*.lead_time' => ['nullable', 'integer', 'min:0'],
            'items.*.weight' => ['nullable', 'numeric', 'min:0'],
            'items.*.dimension' => ['nullable', 'string', 'max:60'],
            'items.*.status' => ['required', 'string', 'in:Aktif,Nonaktif'],
            'items.*.action' => ['required', 'string', 'in:create'],
        ];
    }
}
