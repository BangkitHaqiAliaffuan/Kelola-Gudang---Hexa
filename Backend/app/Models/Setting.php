<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value', 'updated_by_user_id'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }
}
