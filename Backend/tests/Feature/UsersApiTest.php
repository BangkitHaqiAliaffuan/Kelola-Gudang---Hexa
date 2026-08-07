<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UsersApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_users(): void
    {
        User::factory()->count(5)->create();

        $this->getJson('/api/master/users')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_can_search(): void
    {
        User::factory()->create(['name' => 'Rudi Hartono']);
        User::factory()->count(3)->create();

        $this->getJson('/api/master/users?search=hartono')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Rudi Hartono');
    }

    public function test_users_endpoint_is_read_only(): void
    {
        $this->postJson('/api/master/users', ['name' => 'X'])
            ->assertStatus(405);
    }
}
