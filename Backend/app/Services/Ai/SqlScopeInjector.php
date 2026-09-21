<?php

namespace App\Services\Ai;

/**
 * Injeksi warehouse scope ke SQL mentah text-to-SQL (F8.5, opsi A).
 *
 * Latar: query Eloquent ter-scope otomatis via global scope
 * `ScopesToWarehouse`, tetapi SQL mentah `analisis_data` melewatinya — user
 * Terbatas bisa agregat data gudang lain. Kelas ini menyuntikkan predicate
 * gudang secara deterministik SEBELUM eksekusi.
 *
 * Prinsip: fail-closed. Bentuk query yang tak bisa dipahami dengan pasti
 * (CTE, UNION/INTERSECT/EXCEPT, subquery, derived table, LATERAL) DITOLAK
 * untuk user ter-scope, bukan dieksekusi longgar. User mode Semua (null)
 * tidak disentuh sama sekali (pemanggil yang memutuskan).
 *
 * Peta kolom gudang:
 * - langsung: item_stock, stock_movements, racks → warehouse_id;
 *   stock_documents → warehouse_id (konservatif v1: destination_warehouse_id
 *   tidak dihitung sebagai izin lihat); items → default_warehouse_id;
 *   warehouses → id (konsisten daftar_gudang yang terfilter).
 * - via parent: stock_document_lines → stock_documents(document_id);
 *   bins → racks(rack_id).
 * - global (tanpa predicate): suppliers, customers, categories, units.
 */
final class SqlScopeInjector
{
    private const DIRECT = [
        'item_stock' => 'warehouse_id',
        'stock_movements' => 'warehouse_id',
        'racks' => 'warehouse_id',
        'stock_documents' => 'warehouse_id',
        'items' => 'default_warehouse_id',
        'warehouses' => 'id',
    ];

    /** tabel => [tabel induk, fk lokal, kolom gudang induk] */
    private const VIA_PARENT = [
        'stock_document_lines' => ['stock_documents', 'document_id', 'warehouse_id'],
        'bins' => ['racks', 'rack_id', 'warehouse_id'],
    ];

    /** Kata yang tak boleh dianggap alias tabel. */
    private const RESERVED = [
        'WHERE', 'GROUP', 'ORDER', 'LIMIT', 'OFFSET', 'HAVING', 'WINDOW', 'FETCH',
        'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN', 'ON', 'USING', 'NATURAL',
        'UNION', 'INTERSECT', 'EXCEPT', 'SELECT', 'FOR', 'BY', 'ORDER', 'GROUP',
        'ASC', 'DESC', 'INTO',
    ];

    /**
     * Suntikkan predicate scope. $allowedIds TIDAK boleh kosong (mode
     * fail-closed [] ditolak pemanggil sebelum sampai sini).
     *
     * @param  int[]  $allowedIds
     */
    public static function apply(string $sql, array $allowedIds): string
    {
        $ids = array_values(array_unique(array_map('intval', $allowedIds)));
        $ids = array_values(array_filter($ids, fn ($id) => $id > 0));
        if ($ids === []) {
            throw new AiProviderException('Tidak ada gudang dalam lingkup Anda.');
        }

        // Samarkan literal/komentar dengan spasi sama panjang agar offset
        // hasil parse tetap berlaku untuk string SQL asli; FROM di dalam
        // EXTRACT/TRIM/SUBSTRING juga disamarkan (bukan referensi tabel).
        $masked = SqlValidator::blankSpecialFrom(SqlValidator::blankLiterals($sql));
        $upper = strtoupper($masked);

        // --- Bentuk yang didukung: SELECT datar tunggal. ---
        if (preg_match('/\bWITH\b/i', $upper)) {
            throw new AiProviderException('Query dengan WITH tidak didukung untuk lingkup gudang terbatas. Sederhanakan pertanyaan Anda.');
        }
        if (preg_match('/\b(UNION|INTERSECT|EXCEPT)\b/i', $upper)) {
            throw new AiProviderException('Query gabungan (UNION/dsb.) tidak didukung untuk lingkup gudang terbatas. Sederhanakan pertanyaan Anda.');
        }
        if (preg_match('/\bLATERAL\b/i', $upper)) {
            throw new AiProviderException('Query ini tidak didukung untuk lingkup gudang terbatas. Sederhanakan pertanyaan Anda.');
        }
        if (substr_count($upper, 'SELECT') > 1) {
            throw new AiProviderException('Subquery tidak didukung untuk lingkup gudang terbatas. Sederhanakan pertanyaan Anda.');
        }
        if (preg_match('/\b(?:FROM|JOIN)\s*\(/i', $masked)) {
            throw new AiProviderException('Tabel turunan (subquery di FROM) tidak didukung untuk lingkup gudang terbatas. Sederhanakan pertanyaan Anda.');
        }

        // --- Kumpulkan referensi tabel + alias. ---
        $refs = self::tableRefs($masked);
        if ($refs === []) {
            throw new AiProviderException('Query harus memuat klausa FROM.');
        }

        $predicates = [];
        $seenAliases = [];
        $parentN = 0;
        foreach ($refs as $ref) {
            [$table, $alias] = $ref;
            if (! in_array($table, WmsSchema::allowedTables(), true)) {
                throw new AiProviderException("Tabel '{$table}' tidak diizinkan untuk analitik AI.");
            }
            if (isset($seenAliases[$alias]) && $seenAliases[$alias] !== $table) {
                throw new AiProviderException('Alias tabel ambigu. Sederhanakan pertanyaan Anda.');
            }
            $seenAliases[$alias] = $table;

            $in = 'IN ('.implode(',', $ids).')';
            if (isset(self::DIRECT[$table])) {
                $predicates[] = '"'.$alias.'"."'.self::DIRECT[$table].'" '.$in;
            } elseif (isset(self::VIA_PARENT[$table])) {
                [$parent, $fk, $col] = self::VIA_PARENT[$table];
                $pa = '_ai_p'.($parentN++);
                $predicates[] = 'EXISTS (SELECT 1 FROM '.$parent.' "'.$pa.'" WHERE "'.$pa.'"."id" = "'.$alias.'"."'.$fk.'" AND "'.$pa.'"."'.$col.'" '.$in.')';
            }
            // Tabel global: tanpa predicate.
        }

        $predicates = array_values(array_unique($predicates));
        if ($predicates === []) {
            // Hanya menyentuh tabel global (mis. daftar supplier) — aman.
            return $sql;
        }

        $glue = implode(' AND ', $predicates);

        // --- Sisipkan: ke WHERE yang ada, atau buat WHERE baru sebelum
        // klausa penutup (GROUP BY / ORDER BY / LIMIT / ...). ---
        if (preg_match('/\bWHERE\b/i', $masked, $m, PREG_OFFSET_CAPTURE)) {
            $pos = $m[0][1] + strlen($m[0][0]);

            return substr($sql, 0, $pos).' ('.$glue.') AND'.substr($sql, $pos);
        }

        if (preg_match('/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|HAVING|WINDOW|FETCH)\b/i', $masked, $m, PREG_OFFSET_CAPTURE)) {
            $pos = $m[0][1];

            return rtrim(substr($sql, 0, $pos)).' WHERE '.$glue.' '.ltrim(substr($sql, $pos));
        }

        return rtrim(rtrim($sql), ';').' WHERE '.$glue;
    }

    /**
     * Daftar [tabel, alias] dari klausa FROM/JOIN tingkat-atas.
     * Skema non-public ditolak; kata reserved tak dianggap alias.
     *
     * @return array<int, array{0: string, 1: string}>
     */
    private static function tableRefs(string $masked): array
    {
        $refs = [];
        $pattern = '/\b(?:FROM|JOIN)\s+(?:([a-zA-Z_]\w*)\s*\.\s*)?"?([a-zA-Z_]\w*)"?(?:\s+(?:AS\s+)?"?([a-zA-Z_]\w*)"?)?/i';
        if (! preg_match_all($pattern, $masked, $matches, PREG_SET_ORDER)) {
            return [];
        }

        foreach ($matches as $m) {
            $schema = isset($m[1]) && $m[1] !== '' ? strtolower($m[1]) : '';
            if ($schema !== '' && $schema !== 'public') {
                throw new AiProviderException("Skema '{$schema}' tidak diizinkan untuk analitik AI.");
            }
            $table = strtolower($m[2]);
            $alias = isset($m[3]) && $m[3] !== '' ? strtolower($m[3]) : $table;
            if (in_array(strtoupper($alias), self::RESERVED, true)) {
                $alias = $table;
            }
            $refs[] = [$table, $alias];
        }

        return $refs;
    }
}
