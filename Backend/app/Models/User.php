<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'code', 'role', 'default_warehouse_id', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function defaultWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'default_warehouse_id');
    }

    /**
     * Baris registry role (relasi via string `users.role` → `roles.name`;
     * tanpa FK database — lihat RoleController). Null bila role tidak
     * terdaftar (deny-by-default di semua gate).
     */
    public function roleRecord(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role', 'name');
    }

    /**
     * Pengganti pengecekan nama role 'Auditor' yang hardcoded:
     * hak me-review/approve dokumen persediaan + force-unlock.
     */
    public function canReview(): bool
    {
        return (bool) ($this->relationLoaded('roleRecord')
            ? $this->roleRecord?->can_review
            : $this->roleRecord()->first()?->can_review);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'default_warehouse_id' => 'integer',
        ];
    }
}
