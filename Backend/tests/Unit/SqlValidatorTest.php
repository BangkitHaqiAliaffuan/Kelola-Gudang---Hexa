<?php

namespace Tests\Unit;

use App\Services\Ai\AiProviderException;
use App\Services\Ai\SqlValidator;
use PHPUnit\Framework\TestCase;

/**
 * F8.5 — validator SQL baca-saja (L0–L2). Uji adversarial: pastikan DML/DDL,
 * multi-statement, komentar, dan trik bypass ditolak; SELECT sah lolos.
 */
class SqlValidatorTest extends TestCase
{
    private function assertRejected(string $sql): void
    {
        try {
            SqlValidator::assertSafe($sql);
            $this->fail("SQL seharusnya ditolak: {$sql}");
        } catch (AiProviderException) {
            $this->assertTrue(true);
        }
    }

    private function assertAccepted(string $sql): void
    {
        $this->assertSame(trim($sql), SqlValidator::assertSafe($sql));
    }

    public function test_accepts_plain_select(): void
    {
        $this->assertAccepted('SELECT id, name FROM items WHERE stock > 0');
        $this->assertAccepted('WITH x AS (SELECT 1 AS n) SELECT n FROM x');
    }

    public function test_rejects_dml(): void
    {
        $this->assertRejected('INSERT INTO items (name) VALUES (\'x\')');
        $this->assertRejected('UPDATE items SET stock = 0');
        $this->assertRejected('DELETE FROM items');
        $this->assertRejected('SELECT * INTO x FROM items');
    }

    public function test_rejects_ddl_and_privilege(): void
    {
        $this->assertRejected('DROP TABLE items');
        $this->assertRejected('ALTER TABLE items ADD COLUMN x int');
        $this->assertRejected('TRUNCATE items');
        $this->assertRejected('GRANT ALL ON items TO public');
        $this->assertRejected('CREATE TABLE x (id int)');
    }

    public function test_rejects_multi_statement(): void
    {
        $this->assertRejected('SELECT 1; DROP TABLE items');
        $this->assertRejected('SELECT 1; SELECT 2');
        // Semicolon tersembunyi dalam komentar tetap terdeteksi setelah strip.
        $this->assertRejected('SELECT 1 /* ; DROP TABLE items */');
    }

    public function test_rejects_side_effect_functions(): void
    {
        $this->assertRejected('SELECT pg_sleep(10)');
        $this->assertRejected('SELECT pg_read_file(\'/etc/passwd\')');
        $this->assertRejected('SELECT 1 FROM pg_catalog.pg_tables');
        $this->assertRejected('SELECT copy_program');
    }

    public function test_rejects_non_select_start(): void
    {
        $this->assertRejected('EXPLAIN SELECT 1');   // bukan SELECT/WITH
        $this->assertRejected('SET search_path TO x');
        $this->assertRejected('VACUUM items');
    }

    public function test_rejects_system_catalog_access(): void
    {
        $this->assertRejected('SELECT * FROM information_schema.tables');
        $this->assertRejected('SELECT * FROM pg_user');
    }

    public function test_enforce_limit_appends_when_absent(): void
    {
        $this->assertSame(
            'SELECT * FROM items LIMIT 500',
            SqlValidator::enforceLimit('SELECT * FROM items;', 500)
        );
    }

    public function test_enforce_limit_keeps_existing(): void
    {
        $this->assertSame(
            'SELECT * FROM items LIMIT 10',
            SqlValidator::enforceLimit('SELECT * FROM items LIMIT 10', 500)
        );
    }

    public function test_rejects_empty_and_oversized(): void
    {
        $this->assertRejected('');
        $this->assertRejected(str_repeat('SELECT 1 FROM items ', 500));
    }

    public function test_accepts_year_filter_and_txn_value_recipe(): void
    {
        // Regresi insiden: model pernah menyatakan document_date "tidak
        // diizinkan" lalu probing skema. Bentuk query analitik yang benar
        // (filter tahun EXTRACT + agregat nilai transaksi via JOIN) HARUS lolos.
        $this->assertAccepted(
            "SELECT i.name, i.sku, SUM(l.qty * l.unit_cost) AS total FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.status = 'Selesai' AND EXTRACT(YEAR FROM d.document_date) = 2026 GROUP BY i.id, i.name, i.sku ORDER BY total ASC LIMIT 3"
        );
        $this->assertAccepted(
            "SELECT no FROM stock_documents WHERE document_date >= '2026-01-01' AND document_date < '2027-01-01'"
        );
    }

    // ---------- F8.x cek kolom deterministik (anti-confabulation) ----------

    private function assertRejectedWithSuggestion(string $sql, string $suggestion): void
    {
        try {
            SqlValidator::assertSafe($sql);
            $this->fail("SQL seharusnya ditolak: {$sql}");
        } catch (AiProviderException $e) {
            $this->assertStringContainsString("Maksud Anda '{$suggestion}'", $e->getMessage());
        }
    }

    public function test_rejects_unknown_column_with_suggestion(): void
    {
        // Insiden prod: model menulis d.document_type (kolom asli: type).
        $this->assertRejectedWithSuggestion(
            "SELECT i.name, SUM(l.qty) AS total_qty FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.document_type = 'Pengeluaran' GROUP BY i.name ORDER BY total_qty DESC LIMIT 10",
            'type'
        );
        // Kolom telanjang di satu tabel + typo dekat.
        $this->assertRejectedWithSuggestion('SELECT nama FROM items', 'name');
    }

    public function test_rejects_unknown_column_lists_available_columns(): void
    {
        try {
            SqlValidator::assertSafe('SELECT xyz FROM items');
            $this->fail('SQL seharusnya ditolak');
        } catch (AiProviderException $e) {
            $this->assertStringContainsString("'items'", $e->getMessage());
            $this->assertStringContainsString('name', $e->getMessage());
        }
    }

    public function test_accepts_functions_aggregates_and_output_alias(): void
    {
        $this->assertAccepted('SELECT COUNT(*) FROM items');
        $this->assertAccepted('SELECT name, SUM(stock) AS total FROM items GROUP BY name ORDER BY total DESC LIMIT 5');
        $this->assertAccepted('SELECT id FROM stock_documents WHERE EXTRACT(YEAR FROM document_date) = 2026');
        $this->assertAccepted('WITH x AS (SELECT 1 AS n) SELECT n FROM x');
    }

    public function test_accepts_schema_v2_columns_segment_and_movement_link(): void
    {
        // Kolom yang ditambahkan saat koreksi skema (insiden P1 + document_id).
        $this->assertAccepted(
            "SELECT c.segment, SUM(ABS(l.qty * l.unit_price)) AS total FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id LEFT JOIN customers c ON c.id = d.customer_id WHERE d.type = 'Pengeluaran' AND d.status = 'Selesai' GROUP BY c.segment ORDER BY total DESC"
        );
        $this->assertAccepted(
            'SELECT m.direction, SUM(m.qty) AS total FROM stock_movements m JOIN stock_documents d ON d.id = m.stock_document_id GROUP BY m.direction'
        );
    }
}
