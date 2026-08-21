<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

class Department extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'head_user_id',
        'is_active',
    ];

    protected static function booted(): void
    {
        static::saving(function (Department $department) {
            if ($department->head_user_id !== null) {
                $head = User::find($department->head_user_id);
                if ($head && $head->role === 'Administrator') {
                    throw ValidationException::withMessages([
                        'head_user_id' => 'Administrator tidak boleh menjadi kepala departemen.',
                    ]);
                }
            }
        });
    }

    public function head(): BelongsTo
    {
        return $this->belongsTo(User::class, 'head_user_id');
    }
}
