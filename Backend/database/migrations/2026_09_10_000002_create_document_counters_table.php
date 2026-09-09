<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 1.3 — counter atomik penomoran (pengganti pluck+reduce CodeGenerator).
 *
 * Skema key: scope 'plain' + key PREFIX (PRJ, SUP, ..., IB) untuk
 * CodeGenerator::next(); scope 'yearly' + key "PREFIX/YEAR" untuk
 * CodeGenerator::nextYearly(). Kolom bernama counter_key (bukan `key`
 * yang reserved-ish di beberapa DB).
 *
 * Backfill: current_number = MAX numerik suffix dari baris eksisting.
 * Baris non-format (IB-UBAH, BM/BACKDATED/001, PR/2026/5 tanpa pad — angka
 * tetap terparse) di-skip eksplisit kecuali suffix numeriknya valid.
 * Key tanpa baris (RP/RJ/GR) dibuat otomatis saat pemakaian pertama
 * (INSERT ... ON CONFLICT), jadi tidak perlu pre-seed.
 */
return new class extends Migration
{
    /** [table, column, prefix] untuk penomoran plain PREFIX-NNN. */
    private const PLAIN = [
        ['users', 'code', 'USR'],
        ['departments', 'code', 'DEP'],
        ['projects', 'code', 'PRJ'],
        ['categories', 'code', 'KAT'],
        ['sub_categories', 'code', 'SUB'],
        ['merks', 'code', 'MRK'],
        ['units', 'code', 'UNT'],
        ['warehouses', 'code', 'GDG'],
        ['suppliers', 'code', 'SUP'],
        ['customers', 'code', 'CUS'],
        ['vendors', 'code', 'VDR'],
        ['items', 'internal_barcode', 'IB'],
    ];

    /** [table, column, regex dengan grup (prefix, year, seq)] untuk yearly. */
    private const YEARLY = [
        ['stock_documents', 'no', '/^(BM|BK|RP|RJ|ADJ|TF|SO)\/(\d{4})\/(\d+)$/'],
        ['proc_docs', 'no', '/^(PR|PO|GR)\/(\d{4})\/(\d+)$/'],
        ['work_orders', 'no', '/^(WO)\/(\d{4})\/(\d+)$/'],
    ];

    public function up(): void
    {
        Schema::create('document_counters', function (Blueprint $table) {
            $table->string('scope', 30);
            $table->string('counter_key', 60);
            $table->unsignedInteger('current_number')->default(0);
            $table->primary(['scope', 'counter_key']);
        });

        foreach (self::PLAIN as [$table, $column, $prefix]) {
            $max = DB::table($table)->pluck($column)
                ->map(fn ($code) => is_string($code) && preg_match('/^'.preg_quote($prefix, '/').'-(\d+)$/', $code, $m) ? (int) $m[1] : 0)
                ->max();
            if ($max > 0) {
                $this->seed('plain', $prefix, $max);
            }
        }

        foreach (self::YEARLY as [$table, $column, $pattern]) {
            $maxByKey = [];
            foreach (DB::table($table)->pluck($column) as $code) {
                if (! is_string($code) || ! preg_match($pattern, $code, $m)) {
                    continue;
                }
                $key = $m[1].'/'.$m[2];
                $maxByKey[$key] = max($maxByKey[$key] ?? 0, (int) $m[3]);
            }
            foreach ($maxByKey as $key => $max) {
                $this->seed('yearly', $key, $max);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('document_counters');
    }

    private function seed(string $scope, string $key, int $max): void
    {
        DB::table('document_counters')->updateOrInsert(
            ['scope' => $scope, 'counter_key' => $key],
            ['current_number' => $max]
        );
    }
};
