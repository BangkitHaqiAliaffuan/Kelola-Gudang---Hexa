<?php

namespace App\Services\Ai;

/**
 * Validator SQL text-to-SQL (F8.5) — dua lapis independen (L1 & L2),
 * defense-in-depth. Lapisan sebenarnya tetap role DB read-only (L4).
 *
 * L1 `assertReadOnlySelect` dan L2 `validateQuery` sengaja diimplementasikan
 * TERPISAH (daftar pola & cek prefix masing-masing) sehingga celah di satu
 * daftar bukan celah di keduanya.
 */
final class SqlValidator
{
    private const MAX_SQL_LENGTH = 4000;

    /**
     * L0 — sanitasi/validasi awal + L1 + L2 + allowlist tabel. Melempar bila tak lolos.
     */
    public static function assertSafe(string $sql): string
    {
        $sql = trim($sql);

        if ($sql === '' || mb_strlen($sql) > self::MAX_SQL_LENGTH) {
            throw new AiProviderException('Query tidak valid.');
        }

        self::stripNoiseAndAssertNoMultiStatement($sql);
        self::assertReadOnlySelect($sql); // L1
        self::validateQuery($sql);        // L2 (independen)
        self::assertKnownTables($sql);    // allowlist skema WMS

        return $sql;
    }

    /**
     * Samarkan literal string, blok dollar-quoted, dan komentar dengan spasi
     * SAMA PANJANG sehingga offset hasil parse tetap berlaku untuk SQL asli.
     * Dipakai SqlScopeInjector agar kata kunci di dalam teks tak mengecoh parser.
     */
    public static function blankLiterals(string $sql): string
    {
        $out = $sql;
        // Komentar blok (nested) iteratif.
        $prev = null;
        while ($prev !== $out) {
            $prev = $out;
            $out = preg_replace_callback(
                '#/\*.*?\*/#s',
                fn ($m) => str_repeat(' ', strlen($m[0])),
                $out
            );
        }
        // Komentar baris.
        $out = preg_replace_callback(
            '/--[^\n]*/',
            fn ($m) => str_repeat(' ', strlen($m[0])),
            (string) $out
        );
        // Literal string '...' ('' = escape).
        $out = preg_replace_callback(
            "/'(?:[^']|'')*'/",
            fn ($m) => str_repeat(' ', strlen($m[0])),
            (string) $out
        );
        // Blok dollar-quoted ($$...$$ / $tag$...$tag$).
        $out = preg_replace_callback(
            '/\$[a-zA-Z0-9_]*\$.*?\$[a-zA-Z0-9_]*\$/s',
            fn ($m) => str_repeat(' ', strlen($m[0])),
            (string) $out
        );

        return (string) $out;
    }

    /**
     * Samarkan kata kunci FROM di dalam konstruksi khusus SQL — EXTRACT(x
     * FROM y), TRIM(x FROM y), SUBSTRING(x FROM y) — dengan spasi SAMA
     * PANJANG agar tak dianggap referensi tabel oleh parser FROM/JOIN.
     *
     * Latar: `EXTRACT(YEAR FROM d.document_date)` mengandung pola
     * "FROM <ident>.<ident>" sehingga tanpa penyamaran ini ditolak sebagai
     * "tabel document_date / skema d" — padahal query-nya sah. Terapkan
     * SETELAH blankLiterals (literal sudah kosong, panjang string sama
     * sehingga offset tetap berlaku untuk SQL asli).
     */
    public static function blankSpecialFrom(string $sql): string
    {
        $out = $sql;
        foreach (['EXTRACT', 'TRIM', 'SUBSTRING'] as $keyword) {
            $offset = 0;
            while (
                preg_match(
                    '/\b'.preg_quote($keyword, '/').'\s*\(/i',
                    $out,
                    $m,
                    PREG_OFFSET_CAPTURE,
                    $offset
                )
            ) {
                // Posisi '(' pembuka konstruksi.
                $open = $m[0][1] + strlen($m[0][0]) - 1;
                $depth = 0;
                $len = strlen($out);
                $pos = $open;
                while ($pos < $len) {
                    $ch = $out[$pos];
                    if ($ch === '(') {
                        $depth++;
                    } elseif ($ch === ')') {
                        $depth--;
                        if ($depth === 0) {
                            break;
                        }
                    }
                    $pos++;
                }
                if ($depth !== 0) {
                    break; // tak seimbang — biarkan lapisan lain yang menolak
                }
                $span = substr($out, $open + 1, $pos - $open - 1);
                $maskedSpan = preg_replace_callback(
                    '/\bFROM\b/i',
                    fn ($mm) => str_repeat(' ', strlen($mm[0])),
                    $span
                );
                $out = substr($out, 0, $open + 1).$maskedSpan.substr($out, $pos);
                $offset = $pos + 1;
            }
        }

        return $out;
    }

    /**
     * Allowlist tabel: setiap tabel di FROM/JOIN harus ada di skema WMS
     * (atau nama CTE yang didefinisikan query itu sendiri). Menutup tebakan
     * tabel di luar domain (users, audit_logs, settings, ...).
     */
    public static function assertKnownTables(string $sql): void
    {
        // FROM di dalam EXTRACT/TRIM/SUBSTRING bukan referensi tabel.
        $masked = self::blankSpecialFrom(self::blankLiterals($sql));

        // Nama CTE yang didefinisikan query (WITH x AS / , y AS () — bukan tabel fisik.
        $ctes = [];
        if (preg_match_all('/\bWITH\b\s+([a-zA-Z_]\w*)\s+AS\b/i', $masked, $m)) {
            $ctes = array_merge($ctes, array_map('strtolower', $m[1]));
        }
        if (preg_match_all('/,\s*([a-zA-Z_]\w*)\s+AS\s*\(/i', $masked, $m)) {
            $ctes = array_merge($ctes, array_map('strtolower', $m[1]));
        }

        if (! preg_match_all('/\b(?:FROM|JOIN)\s+(?:[a-zA-Z_]\w*\s*\.\s*)?"?([a-zA-Z_]\w*)"?/i', $masked, $m)) {
            return;
        }

        foreach ($m[1] as $table) {
            $table = strtolower($table);
            if (in_array($table, $ctes, true)) {
                continue;
            }
            if (! in_array($table, WmsSchema::allowedTables(), true)) {
                throw new AiProviderException("Tabel '{$table}' tidak diizinkan untuk analitik AI.");
            }
        }
    }

    /**
     * Buang komentar & blok dollar-quoted, lalu tolak multi-statement.
     * Dilakukan SEBELUM cek lain agar trik komentar/`;` tersembunyi gagal.
     */
    private static function stripNoiseAndAssertNoMultiStatement(string $sql): void
    {
        // Hapus komentar blok (nested) iteratif.
        $prev = null;
        $clean = $sql;
        while ($prev !== $clean) {
            $prev = $clean;
            $clean = preg_replace('#/\*.*?\*/#s', ' ', $clean);
        }
        // Hapus komentar baris.
        $clean = preg_replace('/--[^\n]*/', ' ', $clean);
        // Hapus string literal (agar ';' di dalam teks tak dihitung — namun
        // juga mencegah trik pemisah statement via literal).
        $clean = preg_replace("/'(?:[^']|'')*'/", "''", $clean);
        // Dollar-quoted block ($$...$$ / $tag$...$tag$).
        $clean = preg_replace('/\$[a-zA-Z0-9_]*\$.*?\$[a-zA-Z0-9_]*\$/s', ' ', $clean);

        $trimmed = rtrim(trim((string) $clean), ';');
        if (str_contains($trimmed, ';')) {
            throw new AiProviderException('Query hanya boleh satu pernyataan SELECT.');
        }
    }

    /**
     * L1 — hanya SELECT/WITH; sapu pola terlarang.
     */
    private static function assertReadOnlySelect(string $sql): void
    {
        $head = strtoupper(ltrim($sql));
        if (! (str_starts_with($head, 'SELECT') || str_starts_with($head, 'WITH'))) {
            throw new AiProviderException('Hanya query SELECT yang diizinkan.');
        }

        $forbidden = [
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT',
            'REVOKE', 'CREATE', 'REPLACE', 'MERGE', 'CALL', 'DO', 'COPY',
            'VACUUM', 'ANALYZE', 'REINDEX', 'CLUSTER', 'REFRESH', 'LISTEN',
            'NOTIFY', 'SET', 'RESET', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
            'EXECUTE', 'PREPARE', 'DECLARE', 'CURSOR', 'LOCK',
            'PG_SLEEP', 'PG_READ_FILE', 'PG_LS_DIR', 'PG_READ_BINARY_FILE',
            'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'COPY_PROGRAM',
            'INTO', // SELECT ... INTO (menulis)
        ];

        $upper = strtoupper($sql);
        foreach ($forbidden as $word) {
            // Word-boundary agar "updated_at" tak salah kena "UPDATE".
            if (preg_match('/\b'.preg_quote($word, '/').'\b/', $upper)) {
                throw new AiProviderException("Query memuat operasi terlarang ({$word}).");
            }
        }

        // Blokir akses tabel sistem katalog sensitif.
        if (preg_match('/\bPG_(CATALOG|SHADOW|AUTHID|ROLES|USER|GROUP|DATABASE|TABLESPACE|STAT)|INFORMATION_SCHEMA\b/i', $sql)) {
            throw new AiProviderException('Akses katalog sistem tidak diizinkan.');
        }
    }

    /**
     * L2 — implementasi independen: cek prefix ketat + daftar kunci sendiri +
     * harus memuat klausa FROM.
     */
    private static function validateQuery(string $sql): void
    {
        $normalized = strtoupper(trim($sql));

        if (! preg_match('/^(SELECT|WITH)\b/', $normalized)) {
            throw new AiProviderException('Query harus diawali SELECT atau WITH.');
        }

        if (! preg_match('/\bFROM\b/', $normalized)) {
            throw new AiProviderException('Query harus memuat klausa FROM.');
        }

        // Daftar kata kunci terlarang (independen dari L1, sengaja beda bentuk).
        $banned = [
            ';', '--', '/*', '$$', '::regclass', 'pg_', 'dblink', 'lo_',
            'current_setting', 'set_config', 'pg_catalog',
        ];
        foreach ($banned as $needle) {
            if (str_contains(strtolower($sql), $needle) && ! in_array($needle, [';'], true)) {
                throw new AiProviderException('Query memuat pola terlarang.');
            }
        }

        // Semicolon tunggal di akhir boleh; di tengah sudah ditolak L0.
    }

    /**
     * Bungkus query dengan LIMIT pengaman bila belum ada.
     */
    public static function enforceLimit(string $sql, int $max = 1000): string
    {
        $trimmed = rtrim(trim($sql), ';');
        if (preg_match('/\bLIMIT\s+\d+/i', $trimmed)) {
            return $trimmed;
        }

        return $trimmed." LIMIT {$max}";
    }
}
