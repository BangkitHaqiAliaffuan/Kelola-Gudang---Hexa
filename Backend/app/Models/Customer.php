<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'legal_name',
        'nib',
        'npwp',
        'phone',
        'email',
        'pic_name',
        'website',
        'address',
        'city',
        'segment',
        'bank_name',
        'bank_account_no',
        'bank_account_name',
        'verification_status',
        'verification_note',
        'verified_at',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'verified_at' => 'datetime',
    ];
}
