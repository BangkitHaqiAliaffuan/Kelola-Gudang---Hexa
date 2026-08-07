<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'legal_name',
        'nib',
        'npwp',
        'service_type',
        'contact_phone',
        'email',
        'pic_name',
        'website',
        'bank_name',
        'bank_account_no',
        'bank_account_name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
