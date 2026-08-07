<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Bin extends Model
{
    use HasFactory;

    protected $fillable = [
        'rack_id',
        'level',
        'position',
        'code',
        'name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function rack(): BelongsTo
    {
        return $this->belongsTo(Rack::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'default_bin_id');
    }
}
