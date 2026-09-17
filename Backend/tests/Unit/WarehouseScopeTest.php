<?php

namespace Tests\Unit;

use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WarehouseScopeTest extends TestCase
{
    use RefreshDatabase;

    private function makeRole(string $name, string $mode): Role
    {
        return Role::create([
            'name' => $name,
            'description' => null,
            'is_system' => false,
            'can_review' => false,
            'warehouse_scope_mode' => $mode,
        ]);
    }

    public function test_semua_mode_has_no_limit(): void
    {
        $this->makeRole('Pusat', 'Semua');
        $user = User::factory()->create(['role' => 'Pusat']);

        $this->assertSame('Semua', WarehouseScope::modeFor($user));
        $this->assertNull(WarehouseScope::effectiveIdsFor($user));
    }

    public function test_terbatas_mode_returns_assigned_warehouses(): void
    {
        $this->makeRole('Operator A', 'Terbatas');
        $user = User::factory()->create(['role' => 'Operator A']);
        $a = Warehouse::factory()->create();
        $b = Warehouse::factory()->create();
        Warehouse::factory()->create();
        $user->warehouses()->sync([$a->id, $b->id]);

        $this->assertSame('Terbatas', WarehouseScope::modeFor($user));
        $this->assertEqualsCanonicalizing([$a->id, $b->id], WarehouseScope::effectiveIdsFor($user));
    }

    public function test_terbatas_without_pivot_falls_back_to_default(): void
    {
        $this->makeRole('Operator B', 'Terbatas');
        $default = Warehouse::factory()->create();
        $user = User::factory()->create(['role' => 'Operator B', 'default_warehouse_id' => $default->id]);

        $this->assertSame([$default->id], WarehouseScope::effectiveIdsFor($user));
    }

    public function test_terbatas_without_pivot_and_default_is_fail_closed(): void
    {
        $this->makeRole('Operator C', 'Terbatas');
        $user = User::factory()->create(['role' => 'Operator C', 'default_warehouse_id' => null]);

        $this->assertSame([], WarehouseScope::effectiveIdsFor($user));
    }

    public function test_unknown_role_defaults_to_semua(): void
    {
        $user = User::factory()->create(['role' => 'Role Tak Terdaftar']);

        $this->assertSame('Semua', WarehouseScope::modeFor($user));
        $this->assertNull(WarehouseScope::effectiveIdsFor($user));
    }
}
