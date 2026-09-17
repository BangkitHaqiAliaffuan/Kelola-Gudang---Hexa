<?php

namespace App\Models;

use App\Models\Concerns\ScopesToWarehouse;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemStock extends Model
{
    use ScopesToWarehouse;

    protected $table = 'item_stock';

    public $incrementing = false;

    protected $fillable = [
        'item_id',
        'warehouse_id',
        'bin_id',
        'stock',
        'reserved',
        'in_qty',
        'in_cost',
        'unit_cost_avg',
    ];

    protected $casts = [
        'stock' => 'integer',
        'reserved' => 'integer',
        'in_qty' => 'integer',
        'in_cost' => 'float',
        'unit_cost_avg' => 'float',
        'updated_at' => 'datetime',
    ];

    public $timestamps = false;

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function bin(): BelongsTo
    {
        return $this->belongsTo(Bin::class);
    }
}
