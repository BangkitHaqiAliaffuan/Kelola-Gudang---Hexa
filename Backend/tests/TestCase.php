<?php

namespace Tests;

use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    /**
     * Authenticate as an in-memory (non-persisted) user with full "Master Data"
     * access under a non-catalogued role, so DB row counts in feature tests
     * (users, role_permissions, user_count assertions) stay unaffected.
     */
    protected function actingAsMasterAdmin(): void
    {
        RolePermission::firstOrCreate(
            ['role' => 'Test Admin', 'module' => 'Master Data'],
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
