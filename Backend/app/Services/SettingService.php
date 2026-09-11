<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

/**
 * Pengaturan sistem (Fase 1: profil perusahaan untuk kop cetakan).
 * Default live di kode; DB hanya menyimpan override admin.
 */
class SettingService
{
    public const COMPANY_KEYS = [
        'company.name',
        'company.npwp',
        'company.address',
        'company.phone',
        'company.email',
        'company.currency',
        'company.logo',
    ];

    public static function defaults(): array
    {
        return [
            'company.name' => 'PT Kelola Nusantara',
            'company.npwp' => '36.558.442.4-175.225',
            'company.address' => 'Jl. Industri Raya No. 88, Bekasi',
            'company.phone' => '021-8899-2233',
            'company.email' => 'ops@kelolagudang.id',
            'company.currency' => 'IDR',
            'company.logo' => '',
        ];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $defaults = self::defaults();

        return Cache::remember("settings.{$key}", 60, function () use ($key, $defaults, $default) {
            $row = Setting::query()->where('key', $key)->first();

            return $row?->value['v'] ?? $defaults[$key] ?? $default;
        });
    }

    /** @return array<string, mixed> */
    public static function company(): array
    {
        $out = [];
        foreach (self::COMPANY_KEYS as $key) {
            $out[$key] = self::get($key);
        }

        return $out;
    }

    public static function set(string $key, mixed $value, ?int $userId = null): void
    {
        Setting::query()->updateOrCreate(
            ['key' => $key],
            ['value' => ['v' => $value], 'updated_by_user_id' => $userId],
        );
        Cache::forget("settings.{$key}");
    }
}
