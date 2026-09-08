<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Rack;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReconcileBinMismatchCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_reconcile_command_detects_and_fixes_mismatches(): void
    {
        $whA = Warehouse::factory()->create(['name' => 'Gudang A']);
        $whB = Warehouse::factory()->create(['name' => 'Gudang B']);
        $rackB = Rack::factory()->create(['warehouse_id' => $whB->id, 'code' => 'RAK-B']);
        $binB = Bin::factory()->create(['rack_id' => $rackB->id, 'code' => 'BIN-B1']);

        $item = Item::factory()->create(['sku' => 'SKU-ANOMALY-1', 'stock' => 10]);

        // Simulasikan dokumen Selesai yang memiliki bin mismatch dari data lama
        $doc = StockDocument::create([
            'no' => 'BM/2026/00001',
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-08-01',
            'warehouse_id' => $whA->id,
            'posted_at' => now(),
        ]);

        $line = StockDocumentLine::create([
            'document_id' => $doc->id,
            'line_no' => 1,
            'item_id' => $item->id,
            'qty' => 10,
            'unit_cost' => 5000,
            'to_bin_id' => $binB->id,
        ]);

        // Simulasikan movement dengan warehouse A tapi bin B
        $movement = StockMovement::create([
            'stock_document_id' => $doc->id,
            'line_no' => 1,
            'item_id' => $item->id,
            'warehouse_id' => $whA->id,
            'rack_id' => $rackB->id,
            'bin_id' => $binB->id,
            'movement_type' => 'Penerimaan',
            'reference_no' => $doc->no,
            'direction' => 'IN',
            'qty' => 10,
            'unit_cost' => 5000,
            'occurred_at' => '2026-08-01',
        ]);

        // item_stock sengaja kosong (karena dilewati saat mismatch)
        $this->assertSame(0, ItemStock::where('item_id', $item->id)->count());

        // 1. Jalankan mode deteksi (dry-run)
        $this->artisan('stock:reconcile-bin-mismatch')
            ->expectsOutputToContain('1. Hasil Pemeriksaan Stock Movements Mismatch: 1 baris ditemukan.')
            ->expectsOutputToContain('SKU-ANOMALY-1')
            ->assertExitCode(0);

        // Pastikan belum berubah di mode dry-run
        $this->assertSame($binB->id, $movement->fresh()->bin_id);
        $this->assertSame(0, ItemStock::where('item_id', $item->id)->count());

        // 2. Jalankan mode perbaikan (--fix)
        $this->artisan('stock:reconcile-bin-mismatch --fix')
            ->expectsOutputToContain('Memulai perbaikan data...')
            ->expectsOutputToContain('Perbaikan selesai!')
            ->assertExitCode(0);

        // 3. Verifikasi movement dan line sudah dinull-kan bin-nya
        $this->assertNull($movement->fresh()->bin_id);
        $this->assertNull($movement->fresh()->rack_id);
        $this->assertNull($line->fresh()->to_bin_id);

        // 4. Verifikasi item_stock terbentuk sebagai baris lantai di Gudang A
        $this->assertDatabaseHas('item_stock', [
            'item_id' => $item->id,
            'warehouse_id' => $whA->id,
            'bin_id' => null,
            'stock' => 10,
        ]);

        // 5. Verifikasi saldo item_stock sesuai dengan items.stock
        $this->assertSame(10, (int) ItemStock::where('item_id', $item->id)->sum('stock'));

        // 6. Jalankan kembali reconcile -> harus 0 anomali
        $this->artisan('stock:reconcile-bin-mismatch')
            ->expectsOutputToContain('1. Hasil Pemeriksaan Stock Movements Mismatch: 0 baris ditemukan.')
            ->expectsOutputToContain('2. Hasil Pemeriksaan Document Lines Mismatch: 0 baris ditemukan.')
            ->expectsOutputToContain('3. Hasil Pemeriksaan Selisih Total Stok Item vs Ledger (item_stock): 0 item.')
            ->assertExitCode(0);
    }
}
