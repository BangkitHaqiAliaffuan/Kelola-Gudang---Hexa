<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockDocument extends Model
{
    use HasFactory;

    public const TYPES = [
        'Penerimaan',
        'Pengeluaran',
        'Transfer Gudang',
        'Stock Adjustment',
        'Stock Opname',
        'Retur Pembelian',
        'Retur Penjualan',
    ];

    public const STATUSES = [
        'Draft',
        'Menunggu Approval',
        'Selesai',
        'Dibatalkan',
        'Dalam Perjalanan',
    ];

    protected $fillable = [
        'no',
        'type',
        'status',
        'document_date',
        'warehouse_id',
        'destination_warehouse_id',
        'source_document_id',
        'partner',
        'reference_no',
        'pic',
        'note',
        'posted_at',
        'created_by',
    ];

    protected $casts = [
        'document_date' => 'datetime',
        'posted_at' => 'datetime',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(StockDocumentLine::class, 'document_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class, 'stock_document_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function destination(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'destination_warehouse_id');
    }

    public function sourceDocument(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_document_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isPosted(): bool
    {
        return $this->status === 'Selesai' && $this->posted_at !== null;
    }
}
