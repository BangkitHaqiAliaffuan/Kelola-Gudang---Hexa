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
        'blind_count',
        'document_date',
        'frozen_at',
        'warehouse_id',
        'destination_warehouse_id',
        'source_document_id',
        'customer_id',
        'partner',
        'reference_no',
        'pic',
        'note',
        'posted_at',
        'submitted_at',
        'created_by',
        'requester_user_id',
        'approver_user_id',
        'approved_at',
        'decision_note',
        'locked_by_user_id',
        'locked_at',
    ];

    protected $casts = [
        'document_date' => 'datetime',
        'frozen_at' => 'datetime',
        'posted_at' => 'datetime',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'locked_at' => 'datetime',
        'blind_count' => 'boolean',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(StockDocumentLine::class, 'document_id')->orderBy('line_no');
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

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_user_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function locker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by_user_id');
    }

    public function isPosted(): bool
    {
        return $this->status === 'Selesai' && $this->posted_at !== null;
    }
}
