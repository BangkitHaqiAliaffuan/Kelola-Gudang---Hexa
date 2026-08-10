<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    public const MODULES = [
        'Master Data',
        'Transaksi',
        'Persediaan',
        'Stock Opname',
        'Pengadaan',
        'Laporan',
        'System',
        'Audit Trails',
    ];

    public const LEVELS = ['Baca', 'Tulis', 'Kelola'];

    protected $fillable = ['role', 'module', 'level'];

    /**
     * @return array<int, array{module: string, level: string}>
     */
    public static function accessForRole(string $role): array
    {
        return self::query()
            ->where('role', $role)
            ->orderBy('id')
            ->get(['module', 'level'])
            ->map(fn (RolePermission $permission) => [
                'module' => $permission->module,
                'level' => $permission->level,
            ])
            ->all();
    }
}
