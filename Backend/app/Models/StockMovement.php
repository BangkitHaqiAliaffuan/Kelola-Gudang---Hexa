<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_id',
        'warehouse_id',
        'rack_id',
        'bin_id',
        'direction',
        'qty',
        'movement_type',
        'reference_no',
        'partner',
        'unit_cost',
        'pic',
        'note',
        'occurred_at',
        'created_by',
        'stock_document_id',
        'line_no',
        'pair_id',
    ];

    protected $casts = [
        'qty' => 'integer',
        'unit_cost' => 'float',
        'occurred_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function rack(): BelongsTo
    {
        return $this->belongsTo(Rack::class);
    }

    public function bin(): BelongsTo
    {
        return $this->belongsTo(Bin::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function stockDocument(): BelongsTo
    {
        return $this->belongsTo(StockDocument::class, 'stock_document_id');
    }

    public function pair(): BelongsTo
    {
        return $this->belongsTo(self::class, 'pair_id');
    }
}
