<?php

namespace App\Services\Ai;

use Illuminate\Database\QueryException;
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

        $rows = [];
        try {
            $rows = DB::connection($connection)->transaction(function ($db) use ($limited, $timeoutMs) {
                // Transaksi READ ONLY: setiap upaya tulis otomatis gagal di level DB.
                // SET LOCAL (bukan SET TRANSACTION) agar tetap valid saat koneksi
                // sudah berada dalam transaksi/savepoint (mis. suite test).
                $db->statement('SET LOCAL transaction_read_only = ON');
                $db->statement("SET LOCAL statement_timeout = {$timeoutMs}");

                return $db->select($limited);
            });
        } catch (QueryException $e) {
            throw self::translateQueryError($e);
        }

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

    /**
     * Terjemah error DB menjadi pesan aman untuk model (cadangan bila lolos
     * validator statis — mis. ambiguitas). Hanya SQLSTATE 42703 (kolom/tabel
     * tak dikenal) yang diteruskan beserta HINT Postgres (identifier saja,
     * tanpa data); sisanya dilempar ulang generik tanpa bocor SQL.
     */
    private static function translateQueryError(QueryException $e): \Throwable
    {
        $msg = $e->getMessage();
        if (! str_contains($msg, '42703')) {
            return $e;
        }

        $detail = '';
        if (preg_match('/column\s+"?([\w.]+)"?\s+does not exist/i', $msg, $c)) {
            $detail .= "Kolom '{$c[1]}' tidak dikenal. ";
        } elseif (preg_match('/relation\s+"?([\w.]+)"?\s+does not exist/i', $msg, $c)) {
            $detail .= "Tabel '{$c[1]}' tidak dikenal. ";
        }
        if (preg_match('/HINT:\s*(.+?)(\s*\(|$)/s', $msg, $h)) {
            $detail .= 'Petunjuk database: '.trim($h[1]).' ';
        }

        return new AiProviderException(
            trim($detail).' Gunakan hanya tabel/kolom pada skema WMS dan coba lagi.'
        );
    }
}
