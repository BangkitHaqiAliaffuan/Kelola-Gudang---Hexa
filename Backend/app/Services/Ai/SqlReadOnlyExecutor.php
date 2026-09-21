<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Eksekutor SQL baca-saja untuk analitik AI (F8.5).
 *
 * Pertahanan berlapis:
 * - L0–L2: SqlValidator (deterministik, sebelum eksekusi).
 * - L3: dibungkus transaksi READ ONLY + `SET LOCAL statement_timeout` +
 *   LIMIT wrap; koneksi `ai_readonly`.
 * - L4: role DB read-only (bila AI_DB_USERNAME diisi) = pertahanan sebenarnya.
 *
 * Mengembalikan baris terbatas (maks `maxRows`) + metadata kolom; TIDAK
 * mengeksekusi DDL/DML apa pun.
 */
final class SqlReadOnlyExecutor
{
    public function __construct(private readonly int $maxRows = 200) {}

    /**
     * @return array{columns: array<int, string>, rows: array<int, array<string, mixed>>, row_count: int, truncated: bool}
     */
    public function run(string $sql): array
    {
        $safe = SqlValidator::assertSafe($sql);
        $limited = SqlValidator::enforceLimit($safe, $this->maxRows + 1);

        $connection = config('ai.sql_connection', 'ai_readonly');
        $timeoutMs = (int) config('ai.sql_timeout_ms', 10000);

        $rows = DB::connection($connection)->transaction(function ($db) use ($limited, $timeoutMs) {
            // Transaksi READ ONLY: setiap upaya tulis otomatis gagal di level DB.
            // SET LOCAL (bukan SET TRANSACTION) agar tetap valid saat koneksi
            // sudah berada dalam transaksi/savepoint (mis. suite test).
            $db->statement('SET LOCAL transaction_read_only = ON');
            $db->statement("SET LOCAL statement_timeout = {$timeoutMs}");

            return $db->select($limited);
        });

        $truncated = count($rows) > $this->maxRows;
        $rows = array_slice($rows, 0, $this->maxRows);

        $columns = $rows !== [] ? array_keys((array) $rows[0]) : [];

        $out = array_map(fn ($r) => (array) $r, $rows);

        // Catat SQL final (internal, tidak ke user) agar kasus analitik
        // menyimpang (mis. probing skema) bisa dilacak pasti query-nya.
        Log::info('AiSqlReadOnly: query analitik dijalankan.', [
            'sql' => $limited,
            'rows' => count($out),
            'truncated' => $truncated,
        ]);

        return [
            'columns' => $columns,
            'rows' => $out,
            'row_count' => count($out),
            'truncated' => $truncated,
        ];
    }
}
