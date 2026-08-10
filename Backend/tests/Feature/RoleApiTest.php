<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsMasterAdmin();
    }

    public function test_index_returns_all_roles_in_enum_order(): void
    {
        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.id', 1)
            ->assertJsonPath('data.0.name', 'Administrator')
            ->assertJsonPath('data.1.id', 2)
            ->assertJsonPath('data.1.name', 'Supervisor')
            ->assertJsonPath('data.2.id', 3)
            ->assertJsonPath('data.2.name', 'Operator Gudang')
            ->assertJsonPath('data.3.id', 4)
            ->assertJsonPath('data.3.name', 'Auditor');
    }

    public function test_index_returns_zero_counts_when_no_users(): void
    {
        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonPath('data.0.user_count', 0)
            ->assertJsonPath('data.0.active_user_count', 0)
            ->assertJsonPath('data.0.access', []);
    }

    public function test_index_reports_user_counts_per_role(): void
    {
        User::factory()->count(2)->create(['role' => 'Administrator']);
        User::factory()->count(3)->create(['role' => 'Supervisor', 'is_active' => false]);
        User::factory()->count(1)->create(['role' => 'Operator Gudang']);

        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonPath('data.0.user_count', 2)
            ->assertJsonPath('data.0.active_user_count', 2)
            ->assertJsonPath('data.1.user_count', 3)
            ->assertJsonPath('data.1.active_user_count', 0)
            ->assertJsonPath('data.2.user_count', 1)
            ->assertJsonPath('data.2.active_user_count', 1);
    }

    public function test_index_returns_seeded_access_per_role(): void
    {
        $this->seed(RolePermissionSeeder::class);

        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonPath('data.0.access.0.module', 'Master Data')
            ->assertJsonPath('data.0.access.0.level', 'Kelola')
            ->assertJsonPath('data.1.access.0.module', 'Master Data')
            ->assertJsonPath('data.1.access.0.level', 'Baca')
            ->assertJsonPath('data.2.access.0.module', 'Master Data')
            ->assertJsonPath('data.2.access.0.level', 'Baca')
            ->assertJsonCount(8, 'data.3.access')
            ->assertJsonPath('data.3.access.0.module', 'Master Data')
            ->assertJsonPath('data.3.access.0.level', 'Baca');
    }

    public function test_update_sets_access_for_role(): void
    {
        $payload = [
            'access' => [
                ['module' => 'Persediaan', 'level' => 'Kelola'],
                ['module' => 'Laporan', 'level' => 'Baca'],
            ],
        ];

        $this->putJson('/api/master/roles/Supervisor', $payload)
            ->assertOk()
            ->assertJsonPath('data.name', 'Supervisor')
            ->assertJsonCount(2, 'data.access')
            ->assertJsonPath('data.access.0.module', 'Persediaan')
            ->assertJsonPath('data.access.0.level', 'Kelola')
            ->assertJsonPath('data.access.1.module', 'Laporan')
            ->assertJsonPath('data.access.1.level', 'Baca');

        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonPath('data.1.name', 'Supervisor')
            ->assertJsonCount(2, 'data.1.access');
    }

    public function test_update_replaces_prior_access(): void
    {
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => 'Baca']);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Transaksi', 'level' => 'Tulis']);

        $this->putJson('/api/master/roles/Supervisor', [
            'access' => [
                ['module' => 'Audit Trails', 'level' => 'Kelola'],
            ],
        ])->assertOk();

        $this->assertSame(1, RolePermission::query()->where('role', 'Supervisor')->count());
        $this->assertDatabaseHas('role_permissions', [
            'role' => 'Supervisor',
            'module' => 'Audit Trails',
            'level' => 'Kelola',
        ]);
    }

    public function test_update_accepts_empty_access(): void
    {
        $this->putJson('/api/master/roles/Auditor', ['access' => []])
            ->assertOk()
            ->assertJsonCount(0, 'data.access');

        $this->assertSame(0, RolePermission::query()->where('role', 'Auditor')->count());
    }

    public function test_update_rejects_invalid_level(): void
    {
        $this->putJson('/api/master/roles/Supervisor', [
            'access' => [
                ['module' => 'Persediaan', 'level' => 'Hapus'],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('access.0.level');
    }

    public function test_update_rejects_invalid_module(): void
    {
        $this->putJson('/api/master/roles/Supervisor', [
            'access' => [
                ['module' => 'Keuangan', 'level' => 'Baca'],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('access.0.module');
    }

    public function test_update_rejects_duplicate_module(): void
    {
        $this->putJson('/api/master/roles/Supervisor', [
            'access' => [
                ['module' => 'Persediaan', 'level' => 'Baca'],
                ['module' => 'Persediaan', 'level' => 'Tulis'],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('access');
    }

    public function test_update_rejects_unknown_role(): void
    {
        $this->putJson('/api/master/roles/Manager', [
            'access' => [
                ['module' => 'Laporan', 'level' => 'Baca'],
            ],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }
}
