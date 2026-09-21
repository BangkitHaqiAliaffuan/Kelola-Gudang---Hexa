<?php

namespace Tests\Unit;

use App\Services\Ai\AiProviderException;
use App\Services\Ai\SqlScopeInjector;
use PHPUnit\Framework\TestCase;

/**
 * F8.5-hardening — injeksi warehouse scope ke SQL mentah (opsi A).
 * Fail-closed: bentuk tak dikenal ditolak, bukan dieksekusi longgar.
 */
class SqlScopeInjectorTest extends TestCase
{
    public function test_injects_direct_predicate(): void
    {
        $out = SqlScopeInjector::apply(
            'SELECT item_id, SUM(stock) FROM item_stock GROUP BY item_id',
            [3, 7]
        );

        $this->assertStringContainsString('"item_stock"."warehouse_id" IN (3,7)', $out);
        $this->assertStringContainsString('GROUP BY', $out);
        // Predicate disisipkan SEBELUM GROUP BY, bukan ditempel di akhir.
        $this->assertLessThan(
            strpos($out, 'GROUP BY'),
            strpos($out, 'IN (3,7)')
        );
    }

    public function test_appends_where_when_absent_and_keeps_order_by(): void
    {
        $out = SqlScopeInjector::apply(
            'SELECT * FROM stock_movements ORDER BY occurred_at DESC LIMIT 10',
            [5]
        );

        $this->assertStringContainsString('WHERE "stock_movements"."warehouse_id" IN (5)', $out);
        $this->assertLessThan(strpos($out, 'ORDER BY'), strpos($out, 'IN (5)'));
    }

    public function test_extends_existing_where(): void
    {
        $out = SqlScopeInjector::apply(
            "SELECT * FROM items WHERE status = 'Aktif'",
            [2]
        );

        $this->assertStringContainsString('WHERE ("items"."default_warehouse_id" IN (2)) AND', $out);
        // Literal di dalam string tak boleh mengecoh parser.
        $this->assertStringContainsString("'Aktif'", $out);
    }

    public function test_resolves_join_aliases(): void
    {
        $out = SqlScopeInjector::apply(
            'SELECT s.item_id FROM stock_documents s JOIN stock_document_lines l ON l.document_id = s.id',
            [9]
        );

        $this->assertStringContainsString('"s"."warehouse_id" IN (9)', $out);
        $this->assertStringContainsString('EXISTS (SELECT 1 FROM stock_documents "_ai_p0"', $out);
    }

    public function test_bins_scoped_via_racks(): void
    {
        $out = SqlScopeInjector::apply('SELECT code FROM bins', [4]);

        $this->assertStringContainsString('EXISTS (SELECT 1 FROM racks "_ai_p0"', $out);
        $this->assertStringContainsString('"_ai_p0"."warehouse_id" IN (4)', $out);
    }

    public function test_global_tables_need_no_predicate(): void
    {
        $sql = 'SELECT id, name FROM suppliers ORDER BY name';

        $this->assertSame($sql, SqlScopeInjector::apply($sql, [1]));
    }

    public function test_rejects_unknown_table_for_scoped_user(): void
    {
        $this->expectException(AiProviderException::class);

        SqlScopeInjector::apply('SELECT email FROM users', [1]);
    }

    public function test_rejects_union_subquery_cte_and_derived(): void
    {
        foreach ([
            'SELECT a FROM item_stock UNION SELECT a FROM item_stock',
            'SELECT * FROM item_stock WHERE id IN (SELECT item_id FROM stock_movements)',
            'WITH x AS (SELECT * FROM item_stock) SELECT * FROM x',
            'SELECT * FROM (SELECT * FROM item_stock) AS sub',
        ] as $sql) {
            try {
                SqlScopeInjector::apply($sql, [1]);
                $this->fail("SQL seharusnya ditolak: {$sql}");
            } catch (AiProviderException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_rejects_empty_scope(): void
    {
        $this->expectException(AiProviderException::class);

        SqlScopeInjector::apply('SELECT * FROM item_stock', []);
    }

    public function test_extract_from_is_not_a_table_reference(): void
    {
        // Regresi insiden: EXTRACT(YEAR FROM d.document_date) sempat ditolak
        // sebagai "tabel document_date / skema d" di validator + injector.
        $out = SqlScopeInjector::apply(
            "SELECT i.name, SUM(l.qty * l.unit_cost) AS total FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.status = 'Selesai' AND EXTRACT(YEAR FROM d.document_date) = 2026 GROUP BY i.id, i.name ORDER BY total ASC LIMIT 3",
            [9]
        );

        $this->assertStringContainsString('"d"."warehouse_id" IN (9)', $out);
        $this->assertStringContainsString('"i"."default_warehouse_id" IN (9)', $out);
        $this->assertStringContainsString('EXTRACT(YEAR FROM d.document_date)', $out);
        $this->assertStringContainsString('GROUP BY', $out);
    }

    public function test_rejects_non_public_schema(): void
    {
        $this->expectException(AiProviderException::class);

        SqlScopeInjector::apply('SELECT * FROM pg_catalog.pg_tables', [1]);
    }
}
