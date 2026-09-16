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
     * Authenticate as an in-memory (non-persisted) user with full "Master Data"
     * and "Persediaan" access under a non-catalogued role, so DB row counts in
     * feature tests (users, role_permissions, user_count assertions) stay
     * unaffected.
     */
    protected function actingAsMasterAdmin(): void
    {
        $this->seedBaseRoles();
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Master Data'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Persediaan'],
            ['level' => 'Kelola'],
        );
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Laporan'],
            ['level' => 'Kelola'],
        );

        $user = new User([
            'name' => 'Master Admin',
            'email' => 'master.admin@test.local',
            'role' => 'Test Admin',
            'is_active' => true,
        ]);

        Sanctum::actingAs($user, ['*'], 'sanctum');
    }
}
