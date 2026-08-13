<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProcDocLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'proc_doc_id',
        'line_no',
        'item_id',
        'qty',
        'unit_id',
        'price',
    ];

    protected $casts = [
        'qty' => 'integer',
        'price' => 'float',
    ];

    public function doc(): BelongsTo
    {
        return $this->belongsTo(ProcDoc::class, 'proc_doc_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'unit_id');
    }

    public function subtotal(): float
    {
        return (float) $this->qty * (float) $this->price;
    }
}
