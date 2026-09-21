<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\Ai\AiProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakeAiProvider;
use Tests\TestCase;

/**
 * F8.7 — gate biner ai.access: baris (role, 'AI Assistant') = gunakan,
 * tanpa baris = 403. Granularitas tulis/baca tetap di ToolRegistry.
 */
class AiAccessTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, array $perms, bool $withAi): User
    {
        Role::firstOrCreate(['name' => $role], ['is_system' => true, 'warehouse_scope_mode' => 'Semua']);
        foreach ($perms as [$module, $level]) {
            RolePermission::firstOrCreate(
                ['role' => $role, 'module' => $module],
                ['level' => $level],
            );
        }
        if ($withAi) {
            RolePermission::firstOrCreate(
                ['role' => $role, 'module' => 'AI Assistant'],
                ['level' => 'Baca'],
            );
        }

        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    public function test_ai_status_denied_without_ai_row(): void
    {
        $user = $this->makeUser('Tanpa AI', [['Persediaan', 'Tulis']], false);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/ai/status')
            ->assertForbidden()
            ->assertJsonPath('message', 'Role Anda tidak memiliki akses AI Assistant.');
    }

    public function test_ai_status_allowed_with_ai_row(): void
    {
        $user = $this->makeUser('Pakai AI', [['Persediaan', 'Tulis']], true);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/ai/status')
            ->assertOk()
            ->assertJsonStructure(['data' => ['enabled', 'available', 'provider', 'daily_quota']]);
    }

    public function test_read_only_role_with_ai_row_can_chat(): void
    {
        config(['ai.enabled' => true, 'ai.provider' => 'groq', 'ai.daily_quota' => 100]);
        $this->app->instance(AiProvider::class, new FakeAiProvider([
            FakeAiProvider::text('Halo, ada yang bisa dibantu?'),
        ]));

        // Mirip Auditor: Baca di mana-mana + baris AI → chat lolos gate biner
        // (tool tulis tetap tersaring di ToolRegistry::forRole).
        $user = $this->makeUser('Auditor AI', [
            ['Master Data', 'Baca'],
            ['Persediaan', 'Baca'],
            ['Laporan', 'Baca'],
        ], true);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/chat', ['message' => 'halo'])
            ->assertOk()
            ->assertJsonPath('data.message', 'Halo, ada yang bisa dibantu?');
    }

    public function test_level_value_is_ignored_by_binary_gate(): void
    {
        // Level tersimpan formalitas — Kelola maupun Baca sama-sama lolos.
        $user = $this->makeUser('AI Kelola', [['Persediaan', 'Baca']], false);
        RolePermission::create(['role' => 'AI Kelola', 'module' => 'AI Assistant', 'level' => 'Kelola']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/ai/status')
            ->assertOk();
    }
}
