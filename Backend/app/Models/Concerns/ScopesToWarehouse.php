<?php

namespace App\Models\Concerns;

use App\Http\Middleware\EnsureWarehouseScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Global scope lingkup gudang (F7.3).
 *
 * Membaca himpunan izin dari atribut request yang dipasang middleware
 * `scope.warehouse`. Tanpa middleware (console, route tak ter-scope) →
 * tanpa batas. Kolom default `warehouse_id`; override
 * `warehouseScopeColumn()` bila berbeda.
 */
trait ScopesToWarehouse
{
    /**
     * @param  Builder<Model>  $builder
     */
    public static function bootScopesToWarehouse(): void
    {
        static::addGlobalScope('warehouse_scope', function (Builder $builder): void {
            /** @var int[]|null $ids */
            $ids = EnsureWarehouseScope::idsFor(request());

            if ($ids === null) {
                return;
            }

            if ($ids === []) {
                $builder->whereRaw('1 = 0');

                return;
            }

            $builder->whereIn($builder->getModel()->getTable().'.'.static::warehouseScopeColumn(), $ids);
        });
    }

    protected static function warehouseScopeColumn(): string
    {
        return 'warehouse_id';
    }
}
