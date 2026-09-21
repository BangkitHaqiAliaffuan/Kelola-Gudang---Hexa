<?php

namespace Tests\Feature;

use App\Http\Requests\SettingUpdateRequest;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Regression test untuk Fase Keamanan F1:
 * - Operasi TULIS user/role/settings hanya Administrator.
 * - Operasi BACA user/role/settings tetap boleh (role.access).
 * - Administrator terakhir & mutasi akun sendiri diblokir (guard model).
 */
class AdministratorGuardTest extends TestCase
{
    use RefreshDatabase;

    private function administrator(): User
    {
        $user = User::factory()->create(['role' => 'Administrator', 'is_active' => true]);
        RolePermission::firstOrCreate(['role' => 'Administrator', 'module' => 'Master Data'], ['level' => 'Kelola']);
        RolePermission::firstOrCreate(['role' => 'Administrator', 'module' => 'System'], ['level' => 'Kelola']);

        return $user;
    }

    private function supervisorWithMasterTulis(): User
    {
        $user = User::factory()->create(['role' => 'Supervisor', 'is_active' => true]);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => 'Tulis']);

        return $user;
    }

    private function supervisorWithMasterBaca(): User
    {
        $user = User::factory()->create(['role' => 'Supervisor', 'is_active' => true]);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => 'Baca']);

        return $user;
    }

    // ---- TULIS digate administrator ----

    public function test_non_admin_with_master_tulis_cannot_edit_role_matrix(): void
    {
        $user = $this->supervisorWithMasterTulis();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/master/roles/Supervisor', [
                'access' => [['module' => 'System', 'level' => 'Kelola']],
            ])
            ->assertForbidden();
    }

    public function test_non_admin_with_master_tulis_cannot_create_role(): void
    {
        $user = $this->supervisorWithMasterTulis();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/master/roles', [
                'name' => 'Backdoor',
                'access' => [['module' => 'System', 'level' => 'Kelola']],
            ])
            ->assertForbidden();
    }

    public function test_non_admin_with_master_tulis_cannot_create_administrator(): void
    {
        $user = $this->supervisorWithMasterTulis();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/master/users', [
                'name' => 'Attacker Admin',
                'email' => 'attacker@example.com',
                'role' => 'Administrator',
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])
            ->assertForbidden();
    }

    public function test_non_admin_with_system_tulis_cannot_update_settings(): void
    {
        $user = User::factory()->create(['role' => 'Supervisor', 'is_active' => true]);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'System', 'level' => 'Tulis']);

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/system/settings', ['company' => ['name' => 'Hacked Corp']])
            ->assertForbidden();
    }

    // ---- BACA tetap boleh (S8: gate tulis tidak merusak baca) ----

    public function test_non_admin_with_master_baca_can_read_users_and_roles(): void
    {
        $user = $this->supervisorWithMasterBaca();

        $this->actingAs($user, 'sanctum')->getJson('/api/master/users')->assertOk();
        $this->actingAs($user, 'sanctum')->getJson('/api/master/roles')->assertOk();
    }

    public function test_non_admin_with_system_baca_can_read_settings(): void
    {
        $user = User::factory()->create(['role' => 'Supervisor', 'is_active' => true]);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'System', 'level' => 'Baca']);

        $this->actingAs($user, 'sanctum')->getJson('/api/system/settings')->assertOk();
    }

    // ---- Follow-up F2: trait AuthorizesAdministrator mencerminkan gate route ----
    // Bila gate middleware dilepas, authorize() FormRequest tetap menolak non-admin.

    public function test_authorize_trait_rejects_non_admin_directly(): void
    {
        $user = $this->supervisorWithMasterTulis();

        $store = new StoreUserRequest;
        $store->setUserResolver(fn () => $user);
        $this->assertFalse($store->authorize(), 'StoreUserRequest::authorize harus false utk non-admin');

        $setting = new SettingUpdateRequest;
        $setting->setUserResolver(fn () => $user);
        $this->assertFalse($setting->authorize(), 'SettingUpdateRequest::authorize harus false utk non-admin');

        $role = new UpdateRoleRequest;
        $role->setUserResolver(fn () => $user);
        $this->assertFalse($role->authorize(), 'UpdateRoleRequest::authorize harus false utk non-admin');
    }

    public function test_authorize_trait_allows_admin_directly(): void
    {
        $admin = $this->administrator();

        foreach ([
            StoreUserRequest::class,
            UpdateUserRequest::class,
            StoreRoleRequest::class,
            UpdateRoleRequest::class,
            SettingUpdateRequest::class,
        ] as $class) {
            $request = new $class;
            $request->setUserResolver(fn () => $admin);
            $this->assertTrue($request->authorize(), "{$class}::authorize harus true utk admin");
        }
    }

    // ---- Guard Administrator terakhir & mutasi diri sendiri ----

    public function test_admin_cannot_delete_self(): void
    {
        $admin = $this->administrator();
        // Ada admin kedua agar yang diuji murni aturan "hapus diri sendiri".
        $second = $this->administrator();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/master/users/{$admin->id}")
            ->assertStatus(422);
    }

    public function test_last_admin_guard_blocks_model_delete_without_other_admin(): void
    {
        // Jalur HTTP selalu punya aktor admin lain (gate), jadi guard
        // "admin terakhir" diuji pada level model — mis. tinker/command
        // yang mencoba menghapus admin terakhir. Ada aktor terautentikasi
        // (bukan console) agar guard aktif.
        $admin = $this->administrator();
        Role::firstOrCreate(['name' => 'Supervisor']);
        $actor = User::factory()->create(['role' => 'Supervisor']);

        $this->actingAs($actor, 'sanctum');
        $this->expectException(ValidationException::class);
        $admin->delete();
    }

    public function test_last_admin_guard_blocks_demotion_without_other_admin(): void
    {
        $admin = $this->administrator();
        Role::firstOrCreate(['name' => 'Supervisor']);
        $actor = User::factory()->create(['role' => 'Supervisor']);

        $this->actingAs($actor, 'sanctum');
        $this->expectException(ValidationException::class);
        $admin->update(['role' => 'Supervisor']);
    }

    public function test_admin_can_delete_regular_user_when_another_admin_exists(): void
    {
        $actor = $this->administrator();
        $this->administrator(); // admin kedua

        $victim = User::factory()->create(['role' => 'Operator Gudang']);

        $this->actingAs($actor, 'sanctum')
            ->deleteJson("/api/master/users/{$victim->id}")
            ->assertOk();
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->postJson('/api/master/roles', ['name' => 'X'])->assertUnauthorized();
    }

    // ---- W1: nama role sistem Administrator immutable ----

    public function test_admin_cannot_rename_administrator_role(): void
    {
        $actor = $this->administrator();
        Role::firstOrCreate(['name' => 'Administrator']);

        $this->actingAs($actor, 'sanctum')
            ->putJson('/api/master/roles/Administrator', ['name' => 'Superadmin'])
            ->assertUnprocessable();

        $this->assertDatabaseHas('roles', ['name' => 'Administrator']);
        $this->assertDatabaseMissing('roles', ['name' => 'Superadmin']);
        $this->assertSame('Administrator', $actor->fresh()->role);
    }

    public function test_admin_can_rename_regular_role(): void
    {
        $actor = $this->administrator();
        Role::firstOrCreate(['name' => 'Supervisor']);

        $this->actingAs($actor, 'sanctum')
            ->putJson('/api/master/roles/Supervisor', ['name' => 'Pengawas'])
            ->assertOk();

        $this->assertDatabaseHas('roles', ['name' => 'Pengawas']);
    }
}
