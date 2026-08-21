<?php

namespace App\Http\Requests;

use App\Models\Bin;
use App\Models\ItemStock;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use Illuminate\Support\Facades\DB;
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
            'type' => ['required', Rule::in(['Penerimaan', 'Pengeluaran', 'Transfer Gudang', 'Retur Pembelian', 'Retur Penjualan', 'Stock Opname', 'Stock Adjustment'])],
            'status' => ['required', Rule::in(['Draft', 'Selesai'])],
            'document_date' => ['required', 'date'],
            'blind_count' => ['nullable', 'boolean'],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            // Transfer Gudang: warehouse_id = gudang asal, destination_warehouse_id = gudang tujuan.
            'destination_warehouse_id' => [
                'nullable',
                'integer',
                Rule::exists('warehouses', 'id'),
                Rule::requiredIf(fn () => $this->input('type') === 'Transfer Gudang'),
                'different:warehouse_id',
            ],
            // Retur Pembelian / Retur Penjualan: dokumen sumber — wajib ketika
            // source_document_id dikirim; hanya sah untuk tipe retur ber-sumber.
            // RP merujuk Penerimaan (Barang Masuk), RJ merujuk Pengeluaran (Barang Keluar).
            'source_document_id' => [
                'nullable',
                'integer',
                Rule::exists('stock_documents', 'id'),
                Rule::prohibitedIf(fn () => ! in_array($this->input('type'), ['Retur Pembelian', 'Retur Penjualan'], true)),
            ],
            'partner' => ['nullable', 'string', 'max:255'],
            'reference_no' => ['nullable', 'string', 'max:255'],
            'pic' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')],
            // qty selalu positif dari klien; controller menegasi baris Pengeluaran &
            // Retur Pembelian saat menyimpan (konvensi ledger: garis bertanda, arah
            // diturunkan dari tanda qty). Baris Stock Opname TIDAK membawa qty —
            // sistem memakai system_qty (snapshot) & actual_qty (hasil hitung fisik).
            // Stock Adjustment memakai qty BERTANDA (delta koreksi): positif = tambah
            // stok (IN, bin tujuan), negatif = kurangi stok (OUT, bin asal) — `min:1`
            // tidak berlaku karena penyesuaian boleh bernilai negatif.
            'lines.*.qty' => [
                Rule::requiredIf(fn () => $this->input('type') !== 'Stock Opname'),
                Rule::prohibitedIf(fn () => $this->input('type') === 'Stock Opname'),
                'integer',
                Rule::when(fn () => $this->input('type') !== 'Stock Adjustment', 'min:1'),
            ],
            // Stock Opname: system_qty di-snapshot server-side dari item_stock saat
            // dokumen dibuat (nilai kiriman klien diabaikan); actual_qty adalah hasil
            // hitung fisik yang boleh kosong untuk baris yang belum dicek.
            'lines.*.system_qty' => ['nullable', 'integer', 'min:0'],
            'lines.*.actual_qty' => ['nullable', 'integer', 'min:0'],
            // Pengeluaran & Retur Pembelian memakai biaya rata-rata (moving average) di
            // bin asal — di-backfill server saat simpan. Retur Pembelian/Penjualan yang
            // ter-link sumber memakai harga baris sumber; unit_cost kiriman hanya
            // dipakai untuk Penerimaan & Retur Penjualan tanpa sumber (dan sebagai
            // fallback Stock Opname).
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            // Opsi A: Semua transaksi boleh tanpa bin (lantai/gudang) — bin opsional kecuali Stock Opname (butuh lokasi fisik).
            'lines.*.to_bin_id' => [
                'nullable',
                'integer',
                Rule::exists('bins', 'id'),
                Rule::prohibitedIf(fn () => $this->input('type') === 'Stock Opname'),
            ],
            'lines.*.from_bin_id' => [
                'nullable',
                'integer',
                Rule::exists('bins', 'id'),
                Rule::requiredIf(fn () => $this->input('type') === 'Stock Opname'),
            ],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
            // Alasan selisih (root cause) — dipakai Stock Opname yang langsung disimpan Selesai.
            'lines.*.reason_code' => ['nullable', Rule::in(array_keys(StockDocumentLine::REASON_CODES))],
            'lines.*.source_line_id' => [
                'nullable',
                'integer',
                Rule::exists('stock_document_lines', 'id'),
                Rule::requiredIf(fn () => in_array($this->input('type'), ['Retur Pembelian', 'Retur Penjualan'], true) && ! empty($this->input('source_document_id'))),
            ],
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
                $type = $this->input('type');
                $status = $this->input('status');
                $lines = $this->input('lines') ?? [];

                if ($type !== 'Stock Adjustment' || ! $lines) {
                    return;
                }

                // Penyesuaian = delta bertanda: qty tidak boleh nol, dan arah
                // menentukan bin yang wajib (IN → bin tujuan, OUT → bin asal).
                // Saat dokumen langsung diposting (Selesai), setiap baris wajib
                // memakai reason_code (root cause) — alasan wajib ikut dicatat
                // sejak Draft di form, guard posting menutup bypass /post.
                foreach ($lines as $index => $line) {
                    $qty = (int) ($line['qty'] ?? 0);

                    if ($qty === 0) {
                        $validator->errors()->add(
                            "lines.{$index}.qty",
                            'Qty penyesuaian tidak boleh nol.'
                        );

                        continue;
                    }

                    // Opsi A: bin boleh null (lantai/gudang) — tidak wajib, warehouse_id dokumen sebagai lokasi.
                    // Validasi bin-warehouse di after berikutnya hanya untuk bin non-null.

                    if ($status === 'Selesai' && empty($line['reason_code'])) {
                        $validator->errors()->add(
                            "lines.{$index}.reason_code",
                            'Alasan selisih wajib diisi sebelum posting.'
                        );
                    }
                }
            },
            function (Validator $validator) {
                $type = $this->input('type');
                $status = $this->input('status');
                $lines = $this->input('lines') ?? [];

                if ($type !== 'Stock Opname' || $status !== 'Selesai' || ! $lines) {
                    return;
                }

                $uncounted = collect($lines)
                    ->filter(fn ($line) => ($line['actual_qty'] ?? null) === null)
                    ->count();

                if ($uncounted > 0) {
                    $validator->errors()->add(
                        'lines',
                        "Semua barang wajib dihitung sebelum opname diselesaikan ({$uncounted} belum dicek)."
                    );
                }
            },
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
            function (Validator $validator) {
                $type = $this->input('type');
                $sourceDocumentId = $this->input('source_document_id');
                $lines = $this->input('lines') ?? [];

                if ($type !== 'Retur Pembelian' || ! $sourceDocumentId || ! $lines) {
                    return;
                }

                $source = StockDocument::with('lines')->find((int) $sourceDocumentId);

                if (! $source) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber tidak ditemukan.');

                    return;
                }

                if ($source->type !== 'Penerimaan') {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berjenis Penerimaan (Barang Masuk).');

                    return;
                }

                if ($source->status !== 'Selesai') {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berstatus Selesai (sudah diposting).');

                    return;
                }

                if ((int) $source->warehouse_id !== (int) $this->input('warehouse_id')) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berada di gudang yang sama dengan retur.');

                    return;
                }

                $sourceLines = $source->lines->keyBy('id');

                if ($sourceLines->isEmpty()) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber tidak memiliki baris barang.');

                    return;
                }

                // Total qty yang sudah di-retur (dokumen Retur Pembelian non-Dibatalkan)
                // per baris sumber, dijumlahkan dengan qty pada request ini agar
                // pembagian ke beberapa baris ikut terhitung.
                $returnedByLine = StockDocumentLine::query()
                    ->whereNotNull('source_line_id')
                    ->whereIn('source_line_id', $sourceLines->keys())
                    ->whereHas('document', fn ($q) => $q
                        ->where('type', 'Retur Pembelian')
                        ->where('status', '!=', 'Dibatalkan'))
                    ->get()
                    ->groupBy('source_line_id')
                    ->map(fn ($group) => $group->sum(fn ($l) => abs((int) $l->qty)));

                $requestedByLine = [];

                foreach ($lines as $line) {
                    $sourceLineId = $line['source_line_id'] ?? null;

                    if (! $sourceLineId) {
                        continue;
                    }

                    $requestedByLine[(int) $sourceLineId] = (int) ($requestedByLine[(int) $sourceLineId] ?? 0) + abs((int) $line['qty']);
                }

                foreach ($lines as $index => $line) {
                    $sourceLineId = $line['source_line_id'] ?? null;

                    if (! $sourceLineId) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris wajib merujuk baris dokumen sumber.'
                        );

                        continue;
                    }

                    $sourceLine = $sourceLines->get((int) $sourceLineId);

                    if (! $sourceLine) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris sumber bukan milik dokumen sumber.'
                        );

                        continue;
                    }

                    if ((int) $sourceLine->item_id !== (int) $line['item_id']) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris retur harus memakai barang yang sama dengan baris sumber.'
                        );

                        continue;
                    }

                    // Opsi A: bin boleh null — null vs null cocok, null vs bin tidak cocok.
                    if ((int) ($sourceLine->to_bin_id ?? 0) !== (int) ($line['from_bin_id'] ?? 0)) {
                        $validator->errors()->add(
                            "lines.{$index}.from_bin_id",
                            'Bin asal harus sama dengan bin tujuan baris sumber (Penerimaan).'
                        );
                    }

                    $sourceQty = (int) $sourceLine->qty;
                    $alreadyReturned = (int) ($returnedByLine->get((int) $sourceLineId) ?? 0);
                    $requested = (int) ($requestedByLine[(int) $sourceLineId] ?? 0);

                    if ($alreadyReturned + $requested > $sourceQty) {
                        $remaining = max(0, $sourceQty - $alreadyReturned);
                        $validator->errors()->add(
                            "lines.{$index}.qty",
                            "Qty melebihi sisa barang dari dokumen sumber (sisa {$remaining})."
                        );
                    }

                    // Opsi A: untuk Selesai, juga cek stok tersedia di lokasi asal (bin sumber) — sinkron dengan FE Maks = min(sisa, available).
                    if ($this->input('status') === 'Selesai') {
                        $availableRaw = ItemStock::where('item_id', $sourceLine->item_id)
                            ->where('warehouse_id', (int) $this->input('warehouse_id'))
                            ->when(
                                $sourceLine->to_bin_id === null,
                                fn ($q) => $q->whereNull('bin_id'),
                                fn ($q) => $q->where('bin_id', $sourceLine->to_bin_id),
                            )
                            ->value(DB::raw('COALESCE(stock,0) - COALESCE(reserved,0)'));
                        $available = (int) ($availableRaw ?? 0);
                        $remaining = max(0, $sourceQty - $alreadyReturned);
                        $cap = min($remaining, $available);
                        if ($requested > $cap) {
                            $validator->errors()->add(
                                "lines.{$index}.qty",
                                "Qty melebihi stok tersedia di lokasi asal (tersedia {$available}, sisa dokumen {$remaining}, maks {$cap})."
                            );
                        }
                    }
                }
            },
            function (Validator $validator) {
                $type = $this->input('type');
                $sourceDocumentId = $this->input('source_document_id');
                $lines = $this->input('lines') ?? [];

                if ($type !== 'Retur Penjualan' || ! $sourceDocumentId || ! $lines) {
                    return;
                }

                $source = StockDocument::with('lines')->find((int) $sourceDocumentId);

                if (! $source) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber tidak ditemukan.');

                    return;
                }

                if ($source->type !== 'Pengeluaran') {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berjenis Pengeluaran (Barang Keluar).');

                    return;
                }

                if ($source->status !== 'Selesai') {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berstatus Selesai (sudah diposting).');

                    return;
                }

                if ((int) $source->warehouse_id !== (int) $this->input('warehouse_id')) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber harus berada di gudang yang sama dengan retur.');

                    return;
                }

                $sourceLines = $source->lines->keyBy('id');

                if ($sourceLines->isEmpty()) {
                    $validator->errors()->add('source_document_id', 'Dokumen sumber tidak memiliki baris barang.');

                    return;
                }

                // Total qty yang sudah di-retur (dokumen Retur Penjualan non-Dibatalkan)
                // per baris sumber, dijumlahkan dengan qty pada request ini agar
                // pembagian ke beberapa baris ikut terhitung.
                $returnedByLine = StockDocumentLine::query()
                    ->whereNotNull('source_line_id')
                    ->whereIn('source_line_id', $sourceLines->keys())
                    ->whereHas('document', fn ($q) => $q
                        ->where('type', 'Retur Penjualan')
                        ->where('status', '!=', 'Dibatalkan'))
                    ->get()
                    ->groupBy('source_line_id')
                    ->map(fn ($group) => $group->sum(fn ($l) => abs((int) $l->qty)));

                $requestedByLine = [];

                foreach ($lines as $line) {
                    $sourceLineId = $line['source_line_id'] ?? null;

                    if (! $sourceLineId) {
                        continue;
                    }

                    $requestedByLine[(int) $sourceLineId] = (int) ($requestedByLine[(int) $sourceLineId] ?? 0) + abs((int) $line['qty']);
                }

                foreach ($lines as $index => $line) {
                    $sourceLineId = $line['source_line_id'] ?? null;

                    if (! $sourceLineId) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris wajib merujuk baris dokumen sumber.'
                        );

                        continue;
                    }

                    $sourceLine = $sourceLines->get((int) $sourceLineId);

                    if (! $sourceLine) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris sumber bukan milik dokumen sumber.'
                        );

                        continue;
                    }

                    if ((int) $sourceLine->item_id !== (int) $line['item_id']) {
                        $validator->errors()->add(
                            "lines.{$index}.source_line_id",
                            'Baris retur harus memakai barang yang sama dengan baris sumber.'
                        );

                        continue;
                    }

                    if ((int) ($sourceLine->from_bin_id ?? 0) !== (int) ($line['to_bin_id'] ?? 0)) {
                        $validator->errors()->add(
                            "lines.{$index}.to_bin_id",
                            'Bin tujuan harus sama dengan bin asal baris sumber (Pengeluaran).'
                        );
                    }

                    $sourceQty = abs((int) $sourceLine->qty);
                    $alreadyReturned = (int) ($returnedByLine->get((int) $sourceLineId) ?? 0);
                    $requested = (int) ($requestedByLine[(int) $sourceLineId] ?? 0);

                    if ($alreadyReturned + $requested > $sourceQty) {
                        $remaining = max(0, $sourceQty - $alreadyReturned);
                        $validator->errors()->add(
                            "lines.{$index}.qty",
                            "Qty melebihi sisa barang dari dokumen sumber (sisa {$remaining})."
                        );
                    }
                }
            },
        ];
    }
}
