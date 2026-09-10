<?php

namespace App\Observers;

use App\Models\Bin;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Item;
use App\Models\Merk;
use App\Models\Project;
use App\Models\Rack;
use App\Models\SubCategory;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Vendor;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Services\AuditLogger;
use Illuminate\Database\Eloquent\Model;

/**
 * Mencatat Create/Update/Delete master otomatis.
 *
 * - Hanya model allowlist (modul Master Data); ledger (movements/stock) dan
 *   dokumen (lifecycle-nya dicatat eksplisit di controller) dikecualikan.
 * - Perubahan denormalisasi ledger (items.stock/reserved) diabaikan agar
 *   posting dokumen tidak membanjiri jejak.
 * - Field sensitif (password/remember_token) tidak pernah disimpan.
 */
class AuditObserver
{
    public const MODULE = 'Master Data';

    /** @var array<class-string, true> */
    public const OBSERVED = [
        Category::class => true,
        SubCategory::class => true,
        Merk::class => true,
        Unit::class => true,
        Warehouse::class => true,
        Rack::class => true,
        Bin::class => true,
        Supplier::class => true,
        Customer::class => true,
        Vendor::class => true,
        Item::class => true,
        User::class => true,
        Department::class => true,
        Project::class => true,
        WorkOrder::class => true,
    ];

    private const SENSITIVE = ['password', 'remember_token'];

    private const LEDGER_NOISE = ['stock', 'reserved'];

    public function created(Model $model): void
    {
        AuditLogger::record([
            'action' => 'Create',
            'module' => self::MODULE,
            'auditable_type' => class_basename($model),
            'auditable_id' => $model->getKey(),
            'record_no' => $this->recordNo($model),
            'new_values' => $this->clean($model->getAttributes()),
        ]);
    }

    public function updated(Model $model): void
    {
        $changes = $this->clean($model->getChanges());
        unset($changes['updated_at']);

        if ($changes === []) {
            return;
        }

        if ($model instanceof Item
            && array_diff(array_keys($changes), self::LEDGER_NOISE) === []) {
            return;
        }

        $old = array_intersect_key($this->clean($model->getOriginal()), $changes);

        AuditLogger::record([
            'action' => 'Update',
            'module' => self::MODULE,
            'auditable_type' => class_basename($model),
            'auditable_id' => $model->getKey(),
            'record_no' => $this->recordNo($model),
            'old_values' => $old,
            'new_values' => $changes,
        ]);
    }

    public function deleted(Model $model): void
    {
        AuditLogger::record([
            'action' => 'Delete',
            'module' => self::MODULE,
            'auditable_type' => class_basename($model),
            'auditable_id' => $model->getKey(),
            'record_no' => $this->recordNo($model),
            'old_values' => $this->clean($model->getAttributes()),
        ]);
    }

    private function recordNo(Model $model): ?string
    {
        foreach (['no', 'code', 'sku'] as $field) {
            $value = $model->getAttribute($field);
            if ($value !== null && $value !== '') {
                return (string) $value;
            }
        }

        return $model->getAttribute('name');
    }

    private function clean(array $attrs): array
    {
        return array_diff_key($attrs, array_fill_keys(self::SENSITIVE, true));
    }
}
