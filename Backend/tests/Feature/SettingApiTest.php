<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\RolePermission;
use App\Models\Setting;
use App\Models\User;
use App\Services\SettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingApiTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsRole(string $role, string $module, string $level): User
    {
        RolePermission::firstOrCreate(
            ['role' => $role, 'module' => $module],
            ['level' => $level],
        );
        $user = User::factory()->create(['role' => $role, 'is_active' => true]);
        Sanctum::actingAs($user, ['*'], 'sanctum');

        return $user;
    }

    public function test_index_requires_auth(): void
    {
        $this->getJson('/api/system/settings')->assertUnauthorized();
    }

    public function test_update_logo_persists_and_appears_in_index(): void
    {
        $this->actingAsRole('SysAdmin', 'System', 'Kelola');
        $logo = 'data:image/png;base64,'.base64_encode(random_bytes(1024));

        $this->putJson('/api/system/settings', ['company' => ['logo' => $logo]])->assertOk();

        $this->assertEquals($logo, SettingService::get('company.logo'));

        $rows = collect($this->getJson('/api/system/settings')->json('data'));
        $this->assertEquals($logo, $rows->firstWhere('key', 'company.logo')['value']);
    }

    public function test_update_logo_rejects_non_image_and_oversize(): void
    {
        $this->actingAsRole('SysAdmin', 'System', 'Kelola');

        $this->putJson('/api/system/settings', ['company' => ['logo' => 'data:text/html;base64,PGI+']])
            ->assertStatus(422);

        $this->putJson('/api/system/settings', [
            'company' => ['logo' => 'data:image/png;base64,'.str_repeat('A', 700000)],
        ])->assertStatus(422);
    }

    public function test_index_returns_defaults_for_system_baca(): void
    {
        $this->actingAsRole('SysReader', 'System', 'Baca');

        $res = $this->getJson('/api/system/settings')->assertOk();
        $rows = collect($res->json('data'));
        $this->assertEquals('PT Kelola Nusantara', $rows->firstWhere('key', 'company.name')['value']);
        $this->assertTrue($rows->pluck('key')->contains('company.currency'));
        $this->assertEquals('', $rows->firstWhere('key', 'company.logo')['value']);
    }

    public function test_update_requires_system_tulis(): void
    {
        $this->actingAsRole('SysReader', 'System', 'Baca');

        $this->putJson('/api/system/settings', ['company' => ['name' => 'PT Baru']])
            ->assertForbidden();
    }

    public function test_update_persists_and_audits(): void
    {
        $user = $this->actingAsRole('SysAdmin', 'System', 'Kelola');

        $this->putJson('/api/system/settings', [
            'company' => ['name' => 'PT Maju Jaya', 'email' => 'halo@majujaya.id'],
        ])->assertOk();

        $this->assertEquals('PT Maju Jaya', SettingService::get('company.name'));
        $this->assertDatabaseHas('settings', ['key' => 'company.name']);

        $log = AuditLog::query()->where('action', 'Update')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertEquals($user->id, $log->user_id);
        $this->assertEquals('System', $log->module);
    }

    public function test_update_validates_and_ignores_unknown_keys(): void
    {
        $this->actingAsRole('SysAdmin', 'System', 'Kelola');

        $this->putJson('/api/system/settings', ['company' => ['email' => 'bukan-email']])
            ->assertStatus(422);

        $this->putJson('/api/system/settings', ['company' => ['npwp' => '123']])
            ->assertStatus(422);

        $this->putJson('/api/system/settings', [
            'company' => ['name' => 'PT Oke'],
            'other' => ['key' => 'ditolak'],
        ])->assertOk();

        $this->assertFalse(Setting::query()->where('key', 'other.key')->exists());
        $this->assertEquals('PT Oke', SettingService::get('company.name'));
    }
}
