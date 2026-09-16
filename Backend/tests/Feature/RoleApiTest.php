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

    public function test_index_returns_base_roles_from_registry(): void
    {
        $this->getJson('/api/master/roles')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.name', 'Administrator')
            ->assertJsonPath('data.1.name', 'Supervisor')
            ->assertJsonPath('data.2.name', 'Operator Gudang')
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

        $response = $this->getJson('/api/master/roles')->assertOk();

        $byName = collect($response->json('data'))->keyBy('name');
        $this->assertSame(2, $byName['Administrator']['user_count']);
        $this->assertSame(2, $byName['Administrator']['active_user_count']);
        $this->assertSame(3, $byName['Supervisor']['user_count']);
        $this->assertSame(0, $byName['Supervisor']['active_user_count']);
        $this->assertSame(1, $byName['Operator Gudang']['user_count']);
        $this->assertSame(1, $byName['Operator Gudang']['active_user_count']);
    }

    public function test_index_returns_seeded_access_per_role(): void
    {
        $this->seed(RolePermissionSeeder::class);

        $response = $this->getJson('/api/master/roles');
        $response->assertOk();

        $byName = collect($response->json('data'))->keyBy('name');
        $this->assertSame('Kelola', $byName['Administrator']['access'][0]['level']);
        $this->assertSame('Baca', $byName['Supervisor']['access'][0]['level']);
        $this->assertSame('Baca', $byName['Operator Gudang']['access'][0]['level']);
        $this->assertCount(7, $byName['Auditor']['access']);
        $this->assertSame('Baca', $byName['Auditor']['access'][0]['level']);

        // Auditor tanpa modul System (Tidak Ada = tanpa baris).
        $auditorAccess = $byName['Auditor']['access'];
        $this->assertNotContains('System', array_column($auditorAccess, 'module'));
        // Flag can_review hanya milik Auditor.
        $this->assertTrue($byName['Auditor']['can_review']);
        $this->assertFalse($byName['Administrator']['can_review']);
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

        $response = $this->getJson('/api/master/roles')->assertOk();
        $supervisor = collect($response->json('data'))->firstWhere('name', 'Supervisor');
        $this->assertCount(2, $supervisor['access']);
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

    public function test_update_unknown_role_returns_not_found(): void
    {
        $this->putJson('/api/master/roles/Manager', [
            'access' => [
                ['module' => 'Laporan', 'level' => 'Baca'],
            ],
        ])->assertNotFound();
    }

    public function test_role_without_registry_row_is_not_catalogued(): void
    {
        RolePermission::firstOrCreate(['role' => 'Test Admin', 'module' => 'Laporan'], ['level' => 'Baca']);

        $names = collect($this->getJson('/api/master/roles')->json('data'))->pluck('name');

        $this->assertNotContains('Test Admin', $names);
    }
}
