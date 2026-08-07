<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CodeGenerator
{
    public static function next(string $model, string $prefix, string $column = 'code'): string
    {
        $instance = new $model;

        if (! $instance instanceof Model) {
            throw new \InvalidArgumentException("{$model} must be an Eloquent model.");
        }

        return DB::transaction(function () use ($instance, $prefix, $column) {
            DB::selectOne('SELECT pg_advisory_xact_lock(hashtext(?))', ["code:{$instance->getTable()}:{$column}:{$prefix}"]);

            $codes = $instance->query()
                ->where($column, 'like', $prefix.'-%')
                ->pluck($column);

            $next = $codes->reduce(function (?int $carry, string $code) use ($prefix) {
                $number = (int) Str::after($code, $prefix.'-');

                return max($carry ?? 0, $number);
            }, null);

            return $prefix.'-'.str_pad((string) (($next ?? 0) + 1), 3, '0', STR_PAD_LEFT);
        });
    }

    /**
     * Year-scoped sequence: `{PREFIX}/{YEAR}/####` (e.g. WO/2026/0001).
     * The counter resets each calendar year; only codes under the current
     * year's head (`{PREFIX}/{YEAR}/`) are considered when deriving the next number.
     */
    public static function nextYearly(string $model, string $prefix, string $column = 'code'): string
    {
        $instance = new $model;

        if (! $instance instanceof Model) {
            throw new \InvalidArgumentException("{$model} must be an Eloquent model.");
        }

        $head = $prefix.'/'.date('Y');

        return DB::transaction(function () use ($instance, $head, $column) {
            DB::selectOne('SELECT pg_advisory_xact_lock(hashtext(?))', ["code:{$instance->getTable()}:{$column}:{$head}"]);

            $next = $instance->query()
                ->where($column, 'like', $head.'/%')
                ->pluck($column)
                ->reduce(function (?int $carry, string $code) use ($head) {
                    $number = (int) Str::after($code, $head.'/');

                    return max($carry ?? 0, $number);
                }, null);

            return $head.'/'.str_pad((string) (($next ?? 0) + 1), 4, '0', STR_PAD_LEFT);
        });
    }
}
