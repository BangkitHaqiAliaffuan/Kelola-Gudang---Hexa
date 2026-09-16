<?php

namespace Tests;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Registry role selalu ada (validasi exists pada endpoint user/role).
        $this->seedBaseRoles();
    }

    /**
     * Daftarkan role dasar ke tabel `roles` (registry untuk validasi
     * `Rule::exists('roles', 'name')` pada endpoint user/role).
     */
    protected function seedBaseRoles(): void
    {
        foreach (['Administrator', 'Supervisor', 'Operator Gudang', 'Auditor'] as $name) {
            Role::firstOrCreate(
                ['name' => $name],
                ['is_system' => true, 'can_review' => $name === 'Auditor'],
            );
        }
    }

    /**
     * Authenticate as an in-memory (non-persisted) Administrator user with
     * full "Master Data", "Persediaan" and "Laporan" access, so DB row counts
     * in feature tests (users, role_permissions, user_count assertions) stay
     * unaffected.
     *
     * Memakai role `Administrator` (persisted via `roles` registry) karena
     * operasi tulis user/role/settings kini digate `role.administrator`;
     * user-nya sendiri in-memory sehingga tidak muncul di hitungan `users`.
     */
    protected function actingAsMasterAdmin(): void
    {
        $this->seedBaseRoles();
        RolePermission::firstOrCreate(
            ['role' => 'Administrator', 'module' => 'Master Data'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Administrator', 'module' => 'Persediaan'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Administrator', 'module' => 'Laporan'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Administrator', 'module' => 'System'],
            ['level' => 'Kelola'],
        );

        $user = new User([
            'name' => 'Master Admin',
            'email' => 'master.admin@test.local',
            'role' => 'Administrator',
            'is_active' => true,
        ]);

        Sanctum::actingAs($user, ['*'], 'sanctum');
    }
}
