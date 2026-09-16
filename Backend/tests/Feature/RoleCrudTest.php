<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_store_creates_role_with_deny_by_default(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'Staff Gudang'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Staff Gudang')
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.is_system', false)
            ->assertJsonPath('data.can_review', false)
            ->assertJsonPath('data.user_count', 0)
            ->assertJsonCount(0, 'data.access');

        $this->assertDatabaseHas('roles', ['name' => 'Staff Gudang']);
        $this->assertSame(0, RolePermission::query()->where('role', 'Staff Gudang')->count());
    }

    public function test_store_accepts_description_can_review_and_initial_access(): void
    {
        $this->postJson('/api/master/roles', [
            'name' => 'Reviewer',
            'description' => 'Pemeriksa dokumen.',
            'can_review' => true,
            'access' => [
                ['module' => 'Persediaan', 'level' => 'Baca'],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.description', 'Pemeriksa dokumen.')
            ->assertJsonPath('data.can_review', true)
            ->assertJsonCount(1, 'data.access');
    }

    public function test_new_role_with_empty_access_is_denied_everywhere(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'Tamu'])->assertCreated();

        $user = User::factory()->create(['role' => 'Tamu']);

        $this->actingAs($user, 'sanctum')->getJson('/api/master/categories')->assertForbidden();
        $this->actingAs($user, 'sanctum')->getJson('/api/persediaan/stock')->assertForbidden();
        $this->actingAs($user, 'sanctum')->getJson('/api/laporan/mutasi')->assertForbidden();
    }

    public function test_store_rejects_duplicate_name(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'Supervisor'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_store_rejects_name_with_slash(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'A/B'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_update_can_rename_and_propagates_to_users_and_permissions(): void
    {
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Laporan', 'level' => 'Baca']);
        User::factory()->create(['role' => 'Supervisor']);

        $this->putJson('/api/master/roles/Supervisor', ['name' => 'Pengawas'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Pengawas')
            ->assertJsonCount(1, 'data.access');

        $this->assertDatabaseMissing('roles', ['name' => 'Supervisor']);
        $this->assertDatabaseHas('roles', ['name' => 'Pengawas']);
        $this->assertDatabaseHas('users', ['role' => 'Pengawas']);
        $this->assertDatabaseMissing('users', ['role' => 'Supervisor']);
        $this->assertDatabaseHas('role_permissions', ['role' => 'Pengawas', 'module' => 'Laporan']);
        $this->assertSame(0, RolePermission::query()->where('role', 'Supervisor')->count());
    }

    public function test_update_can_toggle_can_review(): void
    {
        $this->putJson('/api/master/roles/Supervisor', ['can_review' => true])
            ->assertOk()
            ->assertJsonPath('data.can_review', true);

        $user = User::factory()->create(['role' => 'Supervisor']);
        $this->assertTrue($user->canReview());
    }

    public function test_reviewer_flag_grants_review_without_kelola(): void
    {
        Role::query()->where('name', 'Supervisor')->update(['can_review' => true]);
        $user = User::factory()->create(['role' => 'Supervisor']);

        $this->assertTrue($user->canReview());
        $this->assertFalse(User::factory()->create(['role' => 'Operator Gudang'])->canReview());
    }

    public function test_update_cannot_strip_system_kelola_from_own_role(): void
    {
        Role::create(['name' => 'Test Admin']);
        RolePermission::create(['role' => 'Test Admin', 'module' => 'System', 'level' => 'Kelola']);

        $this->putJson('/api/master/roles/Test%20Admin', ['access' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors('access');
    }

    public function test_destroy_blocked_when_users_assigned(): void
    {
        User::factory()->create(['role' => 'Supervisor']);

        $this->deleteJson('/api/master/roles/Supervisor')
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');

        $this->assertDatabaseHas('roles', ['name' => 'Supervisor']);
    }

    public function test_destroy_succeeds_when_no_users(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'Sementara'])->assertCreated();

        $this->deleteJson('/api/master/roles/Sementara')
            ->assertOk()
            ->assertJsonPath('message', 'Role dihapus.');

        $this->assertDatabaseMissing('roles', ['name' => 'Sementara']);
    }

    public function test_destroy_unknown_role_returns_not_found(): void
    {
        $this->deleteJson('/api/master/roles/Tidak-Ada')->assertNotFound();
    }

    public function test_user_endpoints_reject_unregistered_role(): void
    {
        $this->postJson('/api/master/users', [
            'name' => 'User Baru',
            'email' => 'baru@kelolagudang.id',
            'role' => 'Khayalan',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertUnprocessable()->assertJsonValidationErrors(['role']);
    }
}
