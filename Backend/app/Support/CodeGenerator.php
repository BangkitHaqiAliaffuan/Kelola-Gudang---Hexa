<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CodeGenerator
{
    public static function next(string $model, string $prefix): string
    {
        $instance = new $model;

        if (! $instance instanceof Model) {
            throw new \InvalidArgumentException("{$model} must be an Eloquent model.");
        }

        return DB::transaction(function () use ($instance, $prefix) {
            DB::selectOne('SELECT pg_advisory_xact_lock(hashtext(?))', ["code:{$instance->getTable()}:{$prefix}"]);

            $codes = $instance->query()
                ->where('code', 'like', $prefix.'-%')
                ->pluck('code');

            $next = $codes->reduce(function (?int $carry, string $code) use ($prefix) {
                $number = (int) Str::after($code, $prefix.'-');

                return max($carry ?? 0, $number);
            }, null);

            return $prefix.'-'.str_pad((string) (($next ?? 0) + 1), 3, '0', STR_PAD_LEFT);
        });
    }
}
