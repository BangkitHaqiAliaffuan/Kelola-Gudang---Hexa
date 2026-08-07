<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'legal_name',
        'nib',
        'phone',
        'email',
        'pic_name',
        'website',
        'address',
        'city',
        'npwp',
        'payment_terms',
        'bank_name',
        'bank_account_no',
        'bank_account_name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'preferred_supplier_id');
    }
}
