<?php

namespace Tests\Feature;

use App\Models\Bin;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Rack;
use App\Models\Warehouse;
use App\Support\StockItemLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\TestCase;

/**
 * Regresi W2 pasca-audit: posting konkuren pada item yang sama diserialisasi
 * per item (menutup TOCTOU assertNoNegativeStock + applyMovements), dengan
 * urutan akuisisi ascending agar bebas deadlock.
 */
class StockPostConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_lock_held_in_transaction_blocks_second_session(): void
    {
        $item = Item::factory()->create();

        DB::transaction(function () use ($item) {
            StockItemLock::acquire([$item->id]);

            $pdo = $this->secondConnection();
            $pdo->exec("SET lock_timeout = '500ms'");

            $blocked = false;
            try {
                $pdo->query('SELECT pg_advisory_lock('.StockItemLock::NAMESPACE.', '.(int) $item->id.')');
            } catch (\PDOException) {
                $blocked = true; // 55P03 lock_timeout — sesi kedua tertahan. Benar.
            }

            $this->assertTrue($blocked, 'Sesi kedua harus tertahan saat lock dipegang transaksi pertama.');

            // Item lain tidak ikut terkunci.
            $other = (int) $pdo->query('SELECT pg_advisory_lock('.StockItemLock::NAMESPACE.', '.($item->id + 999999).')')->fetchColumn();
            $this->assertSame(0, $other);
            $pdo->query('SELECT pg_advisory_unlock_all()');
        });
    }

    public function test_lock_acquired_in_ascending_order(): void
    {
        DB::connection()->enableQueryLog();
        StockItemLock::acquire([9, 2, 5, 2]);

        $bindings = collect(DB::getQueryLog())
            ->filter(fn ($q) => str_contains($q['query'], 'pg_advisory_xact_lock'))
            ->map(fn ($q) => $q['bindings'][1])
            ->all();

        $this->assertSame([2, 5, 9], array_values($bindings));
    }

    public function test_sequential_posts_both_apply_under_lock(): void
    {
        $item = Item::factory()->create(['cost' => 1000, 'price' => 1500]);
        [$wh, , $bin] = $this->makeLocation();
        $this->seedInbound($item, $wh, $bin, 100, 1000);
        $cust = Customer::factory()->create();

        foreach ([30, 20] as $i => $qty) {
            $this->postJson('/api/persediaan/stock-documents', [
                'type' => 'Pengeluaran',
                'status' => 'Selesai',
                'document_date' => '2026-07-'.(10 + $i),
                'warehouse_id' => $wh->id,
                'customer_id' => $cust->id,
                'partner' => $cust->name,
                'lines' => [['item_id' => $item->id, 'qty' => $qty, 'from_bin_id' => $bin->id]],
            ])->assertStatus(201);
        }

        $this->assertSame(50, (int) $item->fresh()->stock);
    }

    private function secondConnection(): PDO
    {
        $cfg = config('database.connections.pgsql');

        return new PDO(
            "pgsql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['database']}",
            $cfg['username'],
            $cfg['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }

    private function makeLocation(): array
    {
        $wh = Warehouse::factory()->create();
        $rack = Rack::factory()->create(['warehouse_id' => $wh->id]);
        $bin = Bin::factory()->create(['rack_id' => $rack->id]);

        return [$wh, $rack, $bin];
    }

    private function seedInbound(Item $item, Warehouse $wh, Bin $bin, int $qty, float $cost = 1000.0): void
    {
        $this->postJson('/api/persediaan/stock-documents', [
            'type' => 'Penerimaan',
            'status' => 'Selesai',
            'document_date' => '2026-07-01',
            'warehouse_id' => $wh->id,
            'partner' => 'PT Seed',
            'lines' => [
                ['item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost, 'to_bin_id' => $bin->id],
            ],
        ])->assertStatus(201);
    }
}
