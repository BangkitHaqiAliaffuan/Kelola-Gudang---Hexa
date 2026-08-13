<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function userWithMasterLevel(string $level): User
    {
        $user = User::factory()->create(['role' => 'Supervisor']);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => $level]);

        return $user;
    }

    private function userWithPersediaanLevel(string $level): User
    {
        $user = User::factory()->create(['role' => 'Operator Gudang']);
        RolePermission::create(['role' => 'Operator Gudang', 'module' => 'Persediaan', 'level' => $level]);

        return $user;
    }

    public function test_baca_allows_read_but_blocks_write(): void
    {
        $user = $this->userWithMasterLevel('Baca');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/master/categories')
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/master/categories', ['name' => 'X'])
            ->assertForbidden();
    }

    public function test_tulis_allows_write_but_blocks_delete(): void
    {
        $user = $this->userWithMasterLevel('Tulis');

        $id = $this->actingAs($user, 'sanctum')
            ->postJson('/api/master/categories', ['name' => 'X'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/master/categories/{$id}")
            ->assertForbidden();
    }

    public function test_kelola_allows_delete(): void
    {
        $user = $this->userWithMasterLevel('Kelola');

        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/master/categories/999')
            ->assertNotFound();
    }

    public function test_no_master_permission_forbids_everything(): void
    {
        $user = User::factory()->create(['role' => 'Auditor']);
        RolePermission::create(['role' => 'Auditor', 'module' => 'Laporan', 'level' => 'Kelola']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/master/categories')
            ->assertForbidden();
    }

    public function test_unauthenticated_request_is_unauthorized(): void
    {
        $this->getJson('/api/master/categories')->assertUnauthorized();
    }

    public function test_persediaan_baca_allows_read_but_blocks_write(): void
    {
        $user = $this->userWithPersediaanLevel('Baca');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/persediaan/stock-documents')
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/persediaan/stock-documents', [])
            ->assertForbidden();
    }

    public function test_persediaan_tulis_allows_write(): void
    {
        $user = $this->userWithPersediaanLevel('Tulis');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/persediaan/stock-documents')
            ->assertOk();

        // Middleware passes (Tulis ≥ Tulis), so the request reaches validation
        // and yields 422 — not 403 from the RBAC guard.
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/persediaan/stock-documents', [])
            ->assertStatus(422);
    }

    public function test_persediaan_without_permission_forbids_everything(): void
    {
        $user = User::factory()->create(['role' => 'Supervisor']);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Laporan', 'level' => 'Kelola']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/persediaan/stock-documents')
            ->assertForbidden();
    }
}
