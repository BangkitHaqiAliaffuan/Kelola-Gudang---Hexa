<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockDocumentLine extends Model
{
    use HasFactory;

    /**
     * Alasan selisih opname (root cause). Label id-ID dipakai frontend.
     */
    public const REASON_CODES = [
        'receiving_error' => 'Kesalahan penerimaan',
        'picking_error' => 'Kesalahan pengambilan',
        'damage' => 'Rusak',
        'theft_shrinkage' => 'Hilang / susut',
        'vendor_short_ship' => 'Kekurangan dari supplier',
        'uom_mismatch' => 'Salah satuan',
        'transfer_unposted' => 'Transfer belum diproses',
        'location_error' => 'Salah lokasi / rak',
        'data_entry' => 'Kesalahan input',
        'other' => 'Lainnya',
    ];

    protected $fillable = [
        'document_id',
        'line_no',
        'item_id',
        'qty',
        'system_qty',
        'actual_qty',
        'from_bin_id',
        'to_bin_id',
        'source_line_id',
        'unit_cost',
        'unit_price',
        'unit_price_estimated',
        'note',
        'reason_code',
        'counted_by_user_id',
        'counted_at',
    ];

    protected $casts = [
        'qty' => 'integer',
        'system_qty' => 'integer',
        'actual_qty' => 'integer',
        'unit_cost' => 'float',
        'unit_price' => 'float',
        'unit_price_estimated' => 'boolean',
        'counted_at' => 'datetime',
    ];

    /**
     * Omzet baris (harga jual × qty absolut). Null bila tanpa harga jual.
     */
    public function subtotal(): ?float
    {
        if ($this->unit_price === null) {
            return null;
        }

        return abs((int) $this->qty) * (float) $this->unit_price;
    }

    /**
     * Margin kotor baris (omzet − HPP). Null bila tanpa harga jual.
     */
    public function margin(): ?float
    {
        if ($this->unit_price === null) {
            return null;
        }

        return abs((int) $this->qty) * ((float) $this->unit_price - (float) $this->unit_cost);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(StockDocument::class, 'document_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function fromBin(): BelongsTo
    {
        return $this->belongsTo(Bin::class, 'from_bin_id');
    }

    public function toBin(): BelongsTo
    {
        return $this->belongsTo(Bin::class, 'to_bin_id');
    }

    public function sourceLine(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_line_id');
    }

    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by_user_id');
    }

    /**
     * Movement quantity (absolute) derived from this line.
     * Opname uses |actual - system|; other types use |qty|.
     */
    public function moveQty(): int
    {
        if ($this->document !== null && $this->document->type === 'Stock Opname') {
            return abs((int) ($this->actual_qty ?? 0) - (int) ($this->system_qty ?? 0));
        }

        return abs((int) $this->qty);
    }

    /**
     * Movement direction derived from this line.
     */
    public function moveDirection(): string
    {
        if ($this->document !== null && $this->document->type === 'Stock Opname') {
            $variance = ((int) $this->actual_qty) - ((int) $this->system_qty);

            return $variance > 0 ? 'IN' : ($variance < 0 ? 'OUT' : 'IN');
        }

        return ((int) $this->qty) >= 0 ? 'IN' : 'OUT';
    }

    /**
     * Opname variance (actual - system). Null for non-opname lines.
     */
    public function variance(): ?int
    {
        if ($this->document === null || $this->document->type !== 'Stock Opname') {
            return null;
        }

        return ((int) $this->actual_qty) - ((int) $this->system_qty);
    }
}
