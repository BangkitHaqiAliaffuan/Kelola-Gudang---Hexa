<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('rebuild:drift', function () {
    $affected = [193, 293, 3, 50, 54, 183, 211, 224];
    $ledger = app(App\Services\StockLedger::class);
    $i = 0;
    foreach ($affected as $id) {
        if (\App\Models\Item::find($id)) {
            $ledger->rebuildForItem($id);
            $i++;
        }
    }
    $this->info("Rebuilt $i items");
});

Artisan::command('stock:reconcile-bin-mismatch {--fix : Lakukan perbaikan data dan rebuild ledger}', function () {
    $fix = (bool) $this->option('fix');

    $this->info($fix ? '=== MODE PERBAIKAN: DETEKSI & REMEDIASI DATA MISMATCH ===' : '=== MODE DETEKSI (DRY-RUN): MEMERIKSA ANOMALI BIN & WAREHOUSE ===');

    // 1. Deteksi Stock Movements dengan Bin Mismatch
    $movements = \App\Models\StockMovement::with(['item', 'bin.rack.warehouse', 'warehouse'])
        ->whereNotNull('bin_id')
        ->get();

    $mismatchedMovements = [];
    foreach ($movements as $m) {
        $binWhId = $m->bin?->rack?->warehouse_id;
        if ($binWhId !== null && (int) $m->warehouse_id !== (int) $binWhId) {
            $mismatchedMovements[] = [
                'movement' => $m,
                'item_id' => $m->item_id,
                'doc_no' => $m->reference_no,
                'sku' => $m->item?->sku,
                'movement_wh' => $m->warehouse?->name ?? "WH-{$m->warehouse_id}",
                'bin_code' => $m->bin?->code,
                'bin_wh' => $m->bin?->rack?->warehouse?->name ?? "WH-{$binWhId}",
            ];
        }
    }

    // 2. Deteksi Stock Document Lines pada Dokumen Selesai dengan Bin Mismatch
    $lines = \App\Models\StockDocumentLine::with(['document', 'item', 'fromBin.rack.warehouse', 'toBin.rack.warehouse'])
        ->whereHas('document', fn ($q) => $q->where('status', 'Selesai'))
        ->get();

    $mismatchedLines = [];
    foreach ($lines as $l) {
        $doc = $l->document;
        $fromWh = $l->fromBin?->rack?->warehouse_id;
        $toWh = $l->toBin?->rack?->warehouse_id;

        $hasFromMismatch = $fromWh !== null && (int) $doc->warehouse_id !== (int) $fromWh;
        $expectedToWh = $doc->type === 'Transfer Gudang' ? (int) $doc->destination_warehouse_id : (int) $doc->warehouse_id;
        $hasToMismatch = $toWh !== null && $expectedToWh !== (int) $toWh;

        if ($hasFromMismatch || $hasToMismatch) {
            $mismatchedLines[] = [
                'line' => $l,
                'item_id' => $l->item_id,
                'doc_no' => $doc->no,
                'type' => $doc->type,
                'sku' => $l->item?->sku,
                'field' => $hasFromMismatch ? 'from_bin' : 'to_bin',
                'doc_wh' => $doc->warehouse_id,
            ];
        }
    }

    // 3. Deteksi Selisih items.stock vs SUM(item_stock.stock)
    $items = \App\Models\Item::all();
    $driftItems = [];
    foreach ($items as $item) {
        $itemStockSum = (int) \App\Models\ItemStock::where('item_id', $item->id)->sum('stock');
        if ((int) $item->stock !== $itemStockSum) {
            $driftItems[] = [
                'item_id' => $item->id,
                'sku' => $item->sku,
                'name' => $item->name,
                'items_stock' => (int) $item->stock,
                'item_stock_sum' => $itemStockSum,
                'selisih' => (int) $item->stock - $itemStockSum,
            ];
        }
    }

    $this->line('');
    $this->info('1. Hasil Pemeriksaan Stock Movements Mismatch: '.count($mismatchedMovements).' baris ditemukan.');
    if (count($mismatchedMovements) > 0) {
        $this->table(
            ['ID Movement', 'No Dokumen', 'SKU', 'Gudang Movement', 'Bin', 'Gudang Asli Bin'],
            array_map(fn ($m) => [
                $m['movement']->id,
                $m['doc_no'],
                $m['sku'],
                $m['movement_wh'],
                $m['bin_code'],
                $m['bin_wh'],
            ], $mismatchedMovements)
        );
    }

    $this->line('');
    $this->info('2. Hasil Pemeriksaan Document Lines Mismatch: '.count($mismatchedLines).' baris ditemukan.');
    if (count($mismatchedLines) > 0) {
        $this->table(
            ['ID Line', 'No Dokumen', 'Tipe', 'SKU', 'Field'],
            array_map(fn ($l) => [
                $l['line']->id,
                $l['doc_no'],
                $l['type'],
                $l['sku'],
                $l['field'],
            ], $mismatchedLines)
        );
    }

    $this->line('');
    $this->info('3. Hasil Pemeriksaan Selisih Total Stok Item vs Ledger (item_stock): '.count($driftItems).' item.');
    if (count($driftItems) > 0) {
        $this->table(
            ['ID Item', 'SKU', 'Nama Barang', 'items.stock', 'item_stock.sum', 'Selisih'],
            $driftItems
        );
    }

    if (! $fix) {
        $this->line('');
        $this->warn('Petunjuk: Jalankan dengan opsi --fix untuk memperbaiki baris mismatch dan meregenerasi item_stock.');
        return 0;
    }

    // Eksekusi Perbaikan
    $this->line('');
    $this->info('Memulai perbaikan data...');

    $affectedItemIds = collect()
        ->merge(array_column($mismatchedMovements, 'item_id'))
        ->merge(array_column($mismatchedLines, 'item_id'))
        ->merge(array_column($driftItems, 'item_id'))
        ->unique()
        ->values();

    \Illuminate\Support\Facades\DB::transaction(function () use ($mismatchedMovements, $mismatchedLines, $affectedItemIds) {
        // A. Reset bin_id & rack_id pada stock_movements mismatch menjadi null (penerimaan lantai yang sah di gudang dokumen)
        foreach ($mismatchedMovements as $entry) {
            $m = $entry['movement'];
            $m->update(['bin_id' => null, 'rack_id' => null]);
        }

        // B. Reset bin_id pada document lines mismatch
        foreach ($mismatchedLines as $entry) {
            $l = $entry['line'];
            $updates = [];
            if ($entry['field'] === 'from_bin') {
                $updates['from_bin_id'] = null;
            }
            if ($entry['field'] === 'to_bin') {
                $updates['to_bin_id'] = null;
            }
            $l->update($updates);
        }

        // C. Rebuild ledger per item
        $ledger = app(\App\Services\StockLedger::class);
        foreach ($affectedItemIds as $itemId) {
            $ledger->rebuildForItem($itemId);
        }
    });

    $this->info('Perbaikan selesai! Total item direbuild: '.$affectedItemIds->count());
    $this->info('Semua saldo item_stock telah disinkronkan kembali.');

    return 0;
})->purpose('Deteksi dan perbaiki pergerakan stok dengan bin mismatch');

