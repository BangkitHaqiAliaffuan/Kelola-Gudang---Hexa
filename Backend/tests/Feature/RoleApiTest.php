<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleApiTest extends TestCase
{
    use RefreshDatabase;

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
            ->assertJsonPath('data.0.active_user_count', 0);
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
}
