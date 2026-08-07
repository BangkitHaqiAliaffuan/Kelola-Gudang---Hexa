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
        'phone',
        'email',
        'address',
        'city',
        'segment',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
