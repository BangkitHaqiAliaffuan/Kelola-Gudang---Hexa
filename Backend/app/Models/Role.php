<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    /** Mode lingkup gudang: 'Semua' = lintas-gudang, 'Terbatas' = hanya gudang user (pivot). */
    public const WAREHOUSE_SCOPES = ['Semua', 'Terbatas'];

    protected $fillable = ['name', 'description', 'is_system', 'can_review', 'warehouse_scope_mode'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'can_review' => 'boolean',
        ];
    }

    public function userCount(): int
    {
        return User::query()->where('role', $this->name)->count();
    }

    public function activeUserCount(): int
    {
        return User::query()->where('role', $this->name)->where('is_active', true)->count();
    }

    /**
     * @return array<int, array{module: string, level: string}>
     */
    public function access(): array
    {
        return RolePermission::accessForRole($this->name);
    }
}
