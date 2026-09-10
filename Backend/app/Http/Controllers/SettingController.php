<?php

namespace App\Http\Controllers;

use App\Http\Requests\SettingUpdateRequest;
use App\Http\Resources\SettingResource;
use App\Services\AuditLogger;
use App\Services\SettingService;

class SettingController extends Controller
{
    public function index()
    {
        $rows = collect(SettingService::COMPANY_KEYS)->map(fn (string $key) => [
            'key' => $key,
            'value' => SettingService::get($key),
        ]);

        return SettingResource::collection($rows);
    }

    public function update(SettingUpdateRequest $request)
    {
        // validated() berbentuk nested ['company' => [...]] mengikuti aturan
        // bertitik; ratakan kembali ke key dotted yang dipakai SettingService.
        $nested = $request->validated();
        $userId = $request->user()?->id;
        $flat = [];

        foreach ($nested['company'] ?? [] as $field => $value) {
            $key = "company.{$field}";
            if (! in_array($key, SettingService::COMPANY_KEYS, true)) {
                continue;
            }
            SettingService::set($key, $value, $userId);
            $flat[$key] = $value;
        }

        AuditLogger::record([
            'action' => 'Update',
            'module' => 'System',
            'auditable_type' => 'Setting',
            'record_no' => 'Profil Perusahaan',
            'new_values' => $flat,
        ], $request);

        return response()->json(['message' => 'Pengaturan disimpan.']);
    }
}
