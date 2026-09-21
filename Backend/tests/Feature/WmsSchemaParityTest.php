<?php

namespace Tests\Feature;

use App\Services\Ai\WmsSchema;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Paritas skema buta AI vs database nyata.
 *
 * Insiden: `WmsSchema` menulis `stock_movements.document_id` (asli:
 * `stock_document_id`) dan menghilangkan `customers.segment` — setiap query
 * AI yang memakai kolom itu gagal 42703. Test ini mengunci: tiap kolom yang
 * dijanjikan ke model HARUS ada di DB, dan kolom kritis analitik HARUS ada
 * di skema (agar kelalaian migrasi baru langsung gagal di CI).
 */
class WmsSchemaParityTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_schema_column_exists_in_database(): void
    {
        foreach (WmsSchema::tables() as $table => $columns) {
            $this->assertTrue(
                Schema::hasTable($table),
                "Tabel skema '{$table}' tidak ada di database."
            );
            $real = Schema::getColumnListing($table);
            foreach ($columns as $col) {
                $this->assertContains(
                    $col,
                    $real,
                    "Kolom skema '{$table}.{$col}' tidak ada di database."
                );
            }
        }
    }

    public function test_critical_analytics_columns_are_exposed(): void
    {
        $tables = WmsSchema::tables();
        $required = [
            'stock_documents' => ['type', 'status', 'document_date', 'customer_id', 'department_id', 'project_id', 'work_order_id'],
            'stock_document_lines' => ['qty', 'unit_cost', 'unit_price', 'from_bin_id', 'to_bin_id'],
            'stock_movements' => ['direction', 'stock_document_id'],
            'customers' => ['segment'],
            'items' => ['cost', 'price', 'min_stock'],
        ];
        foreach ($required as $table => $cols) {
            foreach ($cols as $col) {
                $this->assertContains(
                    $col,
                    $tables[$table] ?? [],
                    "Kolom kritis '{$table}.{$col}' hilang dari skema AI."
                );
            }
        }
    }
}
