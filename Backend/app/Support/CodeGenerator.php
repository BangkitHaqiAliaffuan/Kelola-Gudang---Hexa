<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class CodeGenerator
{
    /**
     * Counter atomik O(1) via tabel document_counters
     * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING).
     *
     * Dijalankan dalam DB::transaction pemanggil-bersarang (savepoint) bila
     * dipanggil dari dalam transaksi dokumen — sehingga burn ikut rollback
     * (gapless, profil deadlock sama seperti advisory-lock lama). Di luar
     * transaksi (mis. seeder) increment autocommit; kegagalan setelahnya
     * meninggalkan gap kecil — diterima (kontrak K1: samakan sequence PG).
     */
    protected static function increment(string $scope, string $key): int
    {
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            $row = DB::selectOne(
                'INSERT INTO document_counters (scope, counter_key, current_number)
                 VALUES (?, ?, 1)
                 ON CONFLICT (scope, counter_key)
                 DO UPDATE SET current_number = document_counters.current_number + 1
                 RETURNING current_number',
                [$scope, $key]
            );

            return (int) $row->current_number;
        }

        return DB::transaction(function () use ($scope, $key) {
            $counter = DB::table('document_counters')
                ->where('scope', $scope)
                ->where('counter_key', $key)
                ->lockForUpdate()
                ->first();

            if ($counter === null) {
                DB::table('document_counters')->insert([
                    'scope' => $scope,
                    'counter_key' => $key,
                    'current_number' => 1,
                ]);

                return 1;
            }

            $next = (int) $counter->current_number + 1;
            DB::table('document_counters')
                ->where('scope', $scope)
                ->where('counter_key', $key)
                ->update(['current_number' => $next]);

            return $next;
        });
    }

    /**
     * Jalur penyembuh: bila kode hasil counter sudah dipakai (nomor manual /
     * legacy di atas counter), hitung ulang MAX seperti implementasi lama
     * lalu sinkronkan counter. Biaya O(n) hanya pada kasus langka ini;
     * jalur normal tetap O(1) + 1 query exists().
     */
    protected static function heal(Model $instance, string $column, string $like, callable $parse, string $scope, string $key, callable $format): string
    {
        $max = $instance->query()
            ->where($column, 'like', $like)
            ->pluck($column)
            ->reduce(function (?int $carry, string $code) use ($parse) {
                return max($carry ?? 0, $parse($code));
            }, null) ?? 0;

        $next = $max + 1;
        DB::table('document_counters')
            ->where('scope', $scope)
            ->where('counter_key', $key)
            ->update(['current_number' => $next]);

        Log::warning('CodeGenerator counter healed to legacy max', [
            'table' => $instance->getTable(),
            'column' => $column,
            'scope' => $scope,
            'key' => $key,
            'current_number' => $next,
        ]);

        return $format($next);
    }

    /**
     * Cek tabrakan + catch-up monotonik (1–2 query btree berindeks):
     * - kandidat sudah dipakai → wajib heal;
     * - ada nomor lebih tinggi (string-compare, aman ke arah false-positive
     *   untuk lebar campuran) → heal agar sekuens tidak mundur di bawah
     *   nomor manual/legacy (kontrak lama: next = max+1).
     * Tanpa ini, nomor manual di atas counter (mis. IB-007 manual lalu
     * auto → IB-001) melanggar ekspektasi monotonik walau tetap unik.
     */
    protected static function needsHeal(Model $instance, string $column, string $like, string $code): bool
    {
        if ($instance->query()->where($column, $code)->exists()) {
            return true;
        }

        return $instance->query()
            ->where($column, 'like', $like)
            ->where($column, '>', $code)
            ->exists();
    }

    protected static function warnOverflow(string $code, int $seq, int $width, array $context = []): void
    {
        if (strlen((string) $seq) > $width) {
            Log::warning('CodeGenerator sequence exceeded pad width', array_merge([
                'code' => $code,
                'width' => $width,
            ], $context));
        }
    }

    public static function next(string $model, string $prefix, string $column = 'code'): string
    {
        $instance = new $model;

        if (! $instance instanceof Model) {
            throw new \InvalidArgumentException("{$model} must be an Eloquent model.");
        }

        return DB::transaction(function () use ($instance, $prefix, $column) {
            $format = fn (int $n) => $prefix.'-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT);
            $seq = self::increment('plain', $prefix);
            $code = $format($seq);
            self::warnOverflow($code, $seq, 3, ['prefix' => $prefix]);

            if (! self::needsHeal($instance, $column, $prefix.'-%', $code)) {
                return $code;
            }

            return self::heal(
                $instance,
                $column,
                $prefix.'-%',
                fn (string $c) => (int) Str::after($c, $prefix.'-'),
                'plain',
                $prefix,
                function (int $n) use ($format) {
                    $code = $format($n);
                    self::warnOverflow($code, $n, 3);

                    return $code;
                }
            );
        });
    }

    /**
     * Year-scoped sequence: `{PREFIX}/{YEAR}/{####}` (e.g. WO/2026/0001).
     * The counter resets each calendar year; only codes under the current
     * year's head (`{PREFIX}/{YEAR}/`) are considered when deriving the next number.
     * `$width` sets the zero-padded number width (default 4, e.g. stock documents
     * use 5: BM/2026/00123).
     */
    public static function nextYearly(string $model, string $prefix, string $column = 'code', int $width = 4): string
    {
        $instance = new $model;

        if (! $instance instanceof Model) {
            throw new \InvalidArgumentException("{$model} must be an Eloquent model.");
        }

        $head = $prefix.'/'.date('Y');

        return DB::transaction(function () use ($instance, $head, $column, $width) {
            $format = fn (int $n) => $head.'/'.str_pad((string) $n, $width, '0', STR_PAD_LEFT);
            $seq = self::increment('yearly', $head);
            $code = $format($seq);
            self::warnOverflow($code, $seq, $width, ['head' => $head]);

            if (! self::needsHeal($instance, $column, $head.'/%', $code)) {
                return $code;
            }

            return self::heal(
                $instance,
                $column,
                $head.'/%',
                fn (string $c) => (int) Str::after($c, $head.'/'),
                'yearly',
                $head,
                function (int $n) use ($format, $width) {
                    $code = $format($n);
                    self::warnOverflow($code, $n, $width);

                    return $code;
                }
            );
        });
    }
}
