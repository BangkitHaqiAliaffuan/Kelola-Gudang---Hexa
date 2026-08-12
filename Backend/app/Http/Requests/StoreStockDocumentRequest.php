<?php

namespace App\Http\Requests;

use App\Models\Bin;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreStockDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['Penerimaan'])],
            'status' => ['required', Rule::in(['Draft', 'Selesai'])],
            'document_date' => ['required', 'date'],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'partner' => ['nullable', 'string', 'max:255'],
            'reference_no' => ['nullable', 'string', 'max:255'],
            'pic' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            'lines.*.qty' => ['required', 'integer', 'min:1'],
            'lines.*.unit_cost' => ['required', 'numeric', 'min:0'],
            'lines.*.to_bin_id' => ['required', 'integer', Rule::exists('bins', 'id')],
            'lines.*.from_bin_id' => ['nullable', 'integer', Rule::exists('bins', 'id')],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Bin penerimaan (dan bin asal bila diisi) harus berada di dalam gudang
     * dokumen — posting memakai rack/warehouse yang diturunkan dari bin tersebut.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $warehouseId = $this->input('warehouse_id');
                $lines = $this->input('lines') ?? [];

                if (! $warehouseId || ! $lines) {
                    return;
                }

                $binIds = collect($lines)
                    ->flatMap(fn ($line) => array_filter([$line['to_bin_id'] ?? null, $line['from_bin_id'] ?? null]))
                    ->unique()
                    ->values();

                if ($binIds->isEmpty()) {
                    return;
                }

                $bins = Bin::with('rack')->whereIn('id', $binIds)->get()->keyBy('id');

                foreach ($lines as $index => $line) {
                    foreach (['to_bin_id', 'from_bin_id'] as $field) {
                        if (empty($line[$field])) {
                            continue;
                        }

                        $bin = $bins->get((int) $line[$field]);

                        if (! $bin || ! $bin->rack || $bin->rack->warehouse_id !== (int) $warehouseId) {
                            $validator->errors()->add(
                                "lines.{$index}.{$field}",
                                'Bin harus berada di gudang yang dipilih.'
                            );
                        }
                    }
                }
            },
        ];
    }
}
