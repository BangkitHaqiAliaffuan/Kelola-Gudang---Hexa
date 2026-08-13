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
            'type' => ['required', Rule::in(['Penerimaan', 'Pengeluaran', 'Transfer Gudang', 'Retur Pembelian', 'Retur Penjualan'])],
            'status' => ['required', Rule::in(['Draft', 'Selesai'])],
            'document_date' => ['required', 'date'],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            // Transfer Gudang: warehouse_id = gudang asal, destination_warehouse_id = gudang tujuan.
            'destination_warehouse_id' => [
                'nullable',
                'integer',
                Rule::exists('warehouses', 'id'),
                Rule::requiredIf(fn () => $this->input('type') === 'Transfer Gudang'),
                'different:warehouse_id',
            ],
            'partner' => ['nullable', 'string', 'max:255'],
            'reference_no' => ['nullable', 'string', 'max:255'],
            'pic' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            // qty selalu positif dari klien; controller menegasi baris Pengeluaran &
            // Retur Pembelian saat menyimpan (konvensi ledger: garis bertanda, arah
            // diturunkan dari tanda qty).
            'lines.*.qty' => ['required', 'integer', 'min:1'],
            // Pengeluaran & Retur Pembelian memakai biaya rata-rata (moving average) di
            // bin asal — di-backfill server saat simpan; unit_cost kiriman hanya dipakai
            // untuk Penerimaan & Retur Penjualan.
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'lines.*.to_bin_id' => [
                'nullable',
                'integer',
                Rule::exists('bins', 'id'),
                Rule::requiredIf(fn () => in_array($this->input('type'), ['Penerimaan', 'Transfer Gudang', 'Retur Penjualan'], true)),
            ],
            'lines.*.from_bin_id' => [
                'nullable',
                'integer',
                Rule::exists('bins', 'id'),
                Rule::requiredIf(fn () => in_array($this->input('type'), ['Pengeluaran', 'Transfer Gudang', 'Retur Pembelian'], true)),
            ],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Setiap bin yang diisi harus berada di gudang yang relevan: untuk
     * Penerimaan/Pengeluaran/Retur semua bin berada di gudang dokumen; untuk
     * Transfer Gudang, bin asal (from_bin_id) berada di gudang asal
     * (warehouse_id) dan bin tujuan (to_bin_id) berada di gudang tujuan
     * (destination_warehouse_id) — posting memakai rack/warehouse yang
     * diturunkan dari bin tersebut.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $warehouseId = $this->input('warehouse_id');
                $destinationId = $this->input('destination_warehouse_id');
                $type = $this->input('type');
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

                        if (! $bin || ! $bin->rack) {
                            $validator->errors()->add(
                                "lines.{$index}.{$field}",
                                'Bin harus berada di gudang yang dipilih.'
                            );

                            continue;
                        }

                        $expected = ($type === 'Transfer Gudang' && $field === 'to_bin_id')
                            ? (int) ($destinationId ?? 0)
                            : (int) $warehouseId;

                        if ($bin->rack->warehouse_id !== $expected) {
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
