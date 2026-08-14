<?php

namespace App\Http\Requests;

use App\Models\Bin;
use App\Models\StockDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateStockDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'document_date' => ['nullable', 'date'],
            'pic' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            'lines.*.from_bin_id' => ['required', 'integer', Rule::exists('bins', 'id')],
            // system_qty dipertahankan dari snapshot dokumen asli; bila kosong
            // (baris baru), di-backfill dari item_stock di controller.
            'lines.*.system_qty' => ['nullable', 'integer', 'min:0'],
            'lines.*.actual_qty' => ['nullable', 'integer', 'min:0'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Bin hitung (from_bin_id) setiap baris harus berada di gudang dokumen —
     * identik dengan validasi store untuk Stock Opname.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var StockDocument|null $document */
                $document = $this->route('stockDocument');

                if (! $document) {
                    return;
                }

                $lines = $this->input('lines') ?? [];

                if (! $lines) {
                    return;
                }

                $binIds = collect($lines)
                    ->pluck('from_bin_id')
                    ->filter()
                    ->unique()
                    ->values();

                if ($binIds->isEmpty()) {
                    return;
                }

                $bins = Bin::with('rack')->whereIn('id', $binIds)->get()->keyBy('id');

                foreach ($lines as $index => $line) {
                    $binId = $line['from_bin_id'] ?? null;

                    if (! $binId) {
                        continue;
                    }

                    $bin = $bins->get((int) $binId);

                    if (! $bin || ! $bin->rack || (int) $bin->rack->warehouse_id !== (int) $document->warehouse_id) {
                        $validator->errors()->add(
                            "lines.{$index}.from_bin_id",
                            'Bin harus berada di gudang yang dipilih.'
                        );
                    }
                }
            },
        ];
    }
}
