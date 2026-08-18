<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\StockDocument;
use App\Models\StockDocumentLine;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockDocumentSummaryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_summary_aggregates_non_draft_per_type(): void
    {
        $this->makeSummaryDoc('Penerimaan', 'Selesai', [
            ['qty' => 5, 'cost' => 1000],
            ['qty' => 3, 'cost' => 1500],
        ]);
        $this->makeSummaryDoc('Penerimaan', 'Draft', [['qty' => 99, 'cost' => 100]]);
        $this->makeSummaryDoc('Pengeluaran', 'Selesai', [['qty' => -4, 'cost' => 2000]]);
        $this->makeSummaryDoc('Pengeluaran', 'Menunggu Approval', [['qty' => -2, 'cost' => 500]]);
        $this->makeSummaryDoc('Stock Adjustment', 'Selesai', [['qty' => 7, 'cost' => 100]]);

        $this->getJson('/api/persediaan/stock-documents/summary')
            ->assertOk()
            ->assertJsonPath('data.masuk.count', 1)
            ->assertJsonPath('data.masuk.qty', 8)
            ->assertJsonPath('data.masuk.value', 9500)
            ->assertJsonPath('data.keluar.count', 2)
            ->assertJsonPath('data.keluar.qty', -6);
    }

    public function test_summary_returns_zeros_when_no_documents(): void
    {
        $this->getJson('/api/persediaan/stock-documents/summary')
            ->assertOk()
            ->assertJsonPath('data.masuk.count', 0)
            ->assertJsonPath('data.masuk.qty', 0)
            ->assertJsonPath('data.masuk.value', 0)
            ->assertJsonPath('data.keluar.count', 0)
            ->assertJsonPath('data.keluar.qty', 0);
    }

    private function makeSummaryDoc(string $type, string $status, array $lines): void
    {
        static $unique = 0;
        $unique++;
        $item = Item::factory()->create([
            'sku' => "SKU-SUM-{$unique}",
            'barcode' => '899'.str_pad((string) $unique, 10, '0', STR_PAD_LEFT),
            'internal_barcode' => "IB-SUM-{$unique}",
        ]);

        $doc = StockDocument::create([
            'no' => "SUM/{$type}/".str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'type' => $type,
            'status' => $status,
            'document_date' => now(),
            'warehouse_id' => Warehouse::factory()->create()->id,
            'pic' => 'Test',
        ]);

        foreach ($lines as $index => $line) {
            StockDocumentLine::create([
                'document_id' => $doc->id,
                'line_no' => $index + 1,
                'item_id' => $item->id,
                'qty' => $line['qty'],
                'unit_cost' => $line['cost'],
            ]);
        }
    }
}
