<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemStock extends Model
{
    protected $table = 'item_stock';

    public $incrementing = false;

    protected $fillable = [
        'item_id',
        'warehouse_id',
        'bin_id',
        'stock',
        'reserved',
        'unit_cost_avg',
    ];

    protected $casts = [
        'stock' => 'integer',
        'reserved' => 'integer',
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
