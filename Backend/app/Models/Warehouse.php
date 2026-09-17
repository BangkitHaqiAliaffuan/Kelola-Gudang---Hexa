<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'city',
        'address',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'default_warehouse_id');
    }

    public function racks(): HasMany
    {
        return $this->hasMany(Rack::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'default_warehouse_id');
    }

    /**
     * User yang ditugaskan ke gudang ini via pivot `user_warehouse`
     * (scoping F7). Jangan ganti `users()` — itu default tampilan.
     */
    public function assignedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_warehouse')->withTimestamps();
    }
}
