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
        self::assertKnownColumns($sql);   // kolom harus ada di skema WMS

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
     * Cek kolom: setiap rujukan `alias.kolom` harus ada di kolom tabel yang
     * di-resolve dari FROM/JOIN; kolom telanjang dicek bila query hanya
     * melibatkan SATU tabel (multi-tabel telanjang dilewati agar tak ada
     * false-positive — DB 42703 translator menjadi cadangan).
     *
     * Presisi di atas kelengkapan: qualifier tak dikenal (alias subquery/CTE),
     * nama fungsi, keyword, dan alias output SELECT selalu dilewati. Kegagalan
     * melempar saran "Maksud Anda …?" agar model koreksi dalam 1 ronde —
     * sumber kebenaran tunggal = WmsSchema::tables() (sama dengan prompt).
     */
    public static function assertKnownColumns(string $sql): void
    {
        $tables = WmsSchema::tables();
        $masked = self::blankSpecialFrom(self::blankLiterals($sql));

        // alias (lowercase) => tabel (lowercase) dari FROM/JOIN.
        $aliasMap = [];
        if (preg_match_all('/\b(?:FROM|JOIN)\s+(?:([a-zA-Z_]\w*)\s*\.\s*)?"?([a-zA-Z_]\w*)"?(\s+(?:\bAS\b\s+)?"?([a-zA-Z_]\w*)"?)?/i', $masked, $m, PREG_SET_ORDER)) {
            foreach ($m as $row) {
                $table = strtolower($row[2]);
                if (! isset($tables[$table])) {
                    continue;
                }
                $alias = isset($row[4]) && $row[4] !== '' ? strtolower($row[4]) : $table;
                if (in_array(strtoupper($alias), self::CLAUSE_KEYWORDS, true)) {
                    $alias = $table;
                }
                $aliasMap[$alias] = $table;
            }
        }
        $involved = array_values(array_unique(array_values($aliasMap)));

        // Nama tabel/CTE/alias yang dirujuk bukan kolom — kecualikan.
        $knownNames = array_merge($involved, array_keys($aliasMap));
        if (preg_match_all('/\bWITH\b\s+([a-zA-Z_]\w*)\s+AS\b/i', $masked, $m)) {
            $knownNames = array_merge($knownNames, array_map('strtolower', $m[1]));
        }
        if (preg_match_all('/,\s*([a-zA-Z_]\w*)\s+AS\s*\(/i', $masked, $m)) {
            $knownNames = array_merge($knownNames, array_map('strtolower', $m[1]));
        }
        $knownNames = array_unique($knownNames);

        // Alias output SELECT (`AS x`) dikecualikan (mis. ORDER BY total).
        $outputAliases = [];
        if (preg_match_all('/\bAS\s+"?([a-zA-Z_]\w*)"?/i', $masked, $m)) {
            $outputAliases = array_map('strtolower', $m[1]);
        }
        // Alias implisit `) alias` di daftar SELECT (tanpa AS).
        if (preg_match('/\bSELECT\b(.*?)\bFROM\b/is', $masked, $m)) {
            if (preg_match_all('/\)\s+"?([a-zA-Z_]\w*)"?/i', $m[1], $mm)) {
                $outputAliases = array_merge($outputAliases, array_map('strtolower', $mm[1]));
            }
        }
        $outputAliases = array_unique($outputAliases);

        if (! preg_match_all('/"?([a-zA-Z_]\w*)"?(\s*\.\s*"?([a-zA-Z_]\w*)"?)?/', $masked, $toks, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            return;
        }

        foreach ($toks as $tok) {
            $hasDot = isset($tok[3]) && $tok[3][0] !== '';
            if ($hasDot) {
                $qualifier = strtolower($tok[1][0]);
                $col = strtolower($tok[3][0]);
                if (! isset($aliasMap[$qualifier])) {
                    continue; // alias subquery/CTE/skema asing — jangan tebak
                }
                $table = $aliasMap[$qualifier];
                if (! in_array($col, $tables[$table], true)) {
                    throw self::unknownColumnError($tok[1][0].'.'.$tok[3][0], $table, $tables[$table]);
                }

                continue;
            }

            $raw = $tok[1][0];
            $ident = strtolower($raw);
            if (in_array(strtoupper($raw), self::CLAUSE_KEYWORDS, true)) {
                continue;
            }
            if (in_array($ident, $knownNames, true)) {
                continue; // nama tabel/CTE/alias di FROM/JOIN
            }
            if (in_array($ident, $outputAliases, true)) {
                continue;
            }
            // Nama fungsi: identifier yang posisinya tepat diikuti '('.
            $end = $tok[1][1] + strlen($raw);
            if (str_starts_with(ltrim(substr($masked, $end)), '(')) {
                continue;
            }
            if (count($involved) !== 1) {
                continue; // ambigu antar-tabel — serahkan ke DB/translator
            }
            $table = $involved[0];
            if (! in_array($ident, $tables[$table], true)) {
                throw self::unknownColumnError($raw, $table, $tables[$table]);
            }
        }
    }

    /**
     * Kata kunci/klausa yang bukan rujukan kolom (huruf besar saat banding).
     */
    private const CLAUSE_KEYWORDS = [
        'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT',
        'OFFSET', 'AS', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IN', 'LIKE',
        'ILIKE', 'BETWEEN', 'IS', 'DISTINCT', 'ASC', 'DESC', 'JOIN', 'LEFT',
        'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'WITH', 'UNION', 'ALL',
        'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'EXTRACT',
        'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'CURRENT_DATE',
        'CURRENT_TIMESTAMP', 'NOW', 'INTERVAL', 'TRUE', 'FALSE', 'COALESCE',
        'NULLIF', 'OVER', 'PARTITION',
    ];

    private static function unknownColumnError(string $got, string $table, array $columns): AiProviderException
    {
        $suggest = self::suggestColumn($got, $columns);
        $hint = $suggest !== null ? " Maksud Anda '{$suggest}'?" : '';
        $list = implode(', ', $columns);

        return new AiProviderException(
            "Kolom '{$got}' tidak dikenal di tabel '{$table}'.{$hint} Kolom yang tersedia: {$list}."
        );
    }

    /**
     * Saran kolom: akhiran setelah underscore (`document_type` → `type`),
     * lalu Levenshtein dekat, lalu substring (kandidat ≥3 huruf agar `id`
     * tak cocok sembarang).
     */
    private static function suggestColumn(string $unknown, array $columns): ?string
    {
        // Kupas qualifier alias bila ada (d.document_type → document_type).
        $base = $unknown;
        if (str_contains($base, '.')) {
            $base = substr($base, strrpos($base, '.') + 1);
        }
        $u = strtolower(trim($base, '"'));

        foreach ($columns as $c) {
            $lc = strtolower($c);
            if ($u === $lc) {
                return $c;
            }
            if (str_ends_with($u, '_'.$lc)) {
                return $c;
            }
        }

        $best = null;
        $bestScore = PHP_INT_MAX;
        foreach ($columns as $c) {
            $lc = strtolower($c);
            $d = levenshtein($u, $lc);
            $threshold = max(2, (int) floor(min(strlen($u), strlen($lc)) / 3));
            if ($d <= $threshold && $d < $bestScore) {
                $best = $c;
                $bestScore = $d;
            }
        }
        if ($best !== null) {
            return $best;
        }

        foreach ($columns as $c) {
            $lc = strtolower($c);
            if (strlen($lc) >= 3 && (str_contains($u, $lc) || str_contains($lc, $u))) {
                return $c;
            }
        }

        return null;
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
