<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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

    public function test_index_exposes_code_role_and_active(): void
    {
        $user = User::factory()->create(['role' => 'Auditor']);

        $this->getJson('/api/master/users')
            ->assertOk()
            ->assertJsonPath('data.0.code', $user->code)
            ->assertJsonPath('data.0.role', 'Auditor')
            ->assertJsonPath('data.0.is_active', true)
            ->assertJsonPath('data.0.email', $user->email);
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

    public function test_index_can_search_by_code(): void
    {
        User::factory()->create(['name' => 'Rudi Hartono']);

        $user = User::first();

        $this->getJson('/api/master/users?search='.$user->code)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.code', $user->code);
    }

    public function test_can_store_user(): void
    {
        $this->postJson('/api/master/users', [
            'code' => 'USR-999',
            'name' => 'Test User',
            'email' => 'test.user@kelolagudang.id',
            'role' => 'Supervisor',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'USR-999')
            ->assertJsonPath('data.name', 'Test User')
            ->assertJsonPath('data.role', 'Supervisor')
            ->assertJsonPath('data.is_active', true);

        $this->assertDatabaseHas('users', [
            'code' => 'USR-999',
            'email' => 'test.user@kelolagudang.id',
        ]);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/users', [
            'name' => 'Otomatis Kode',
            'email' => 'otomatis@kelolagudang.id',
            'role' => 'Operator Gudang',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'USR-001');
    }

    public function test_store_hashes_password(): void
    {
        $this->postJson('/api/master/users', [
            'name' => 'Test User',
            'email' => 'test.user@kelolagudang.id',
            'role' => 'Operator Gudang',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertCreated();

        $user = User::where('email', 'test.user@kelolagudang.id')->first();

        $this->assertNotSame('rahasia123', $user->password);
        $this->assertTrue(Hash::check('rahasia123', $user->password));
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/users', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'role', 'password']);
    }

    public function test_store_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'sama@kelolagudang.id']);

        $this->postJson('/api/master/users', [
            'name' => 'User Baru',
            'email' => 'sama@kelolagudang.id',
            'role' => 'Operator Gudang',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_store_rejects_invalid_role(): void
    {
        $this->postJson('/api/master/users', [
            'name' => 'User Baru',
            'email' => 'baru@kelolagudang.id',
            'role' => 'Superadmin',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);
    }

    public function test_store_rejects_short_password(): void
    {
        $this->postJson('/api/master/users', [
            'name' => 'User Baru',
            'email' => 'baru@kelolagudang.id',
            'role' => 'Operator Gudang',
            'password' => 'pendek',
            'password_confirmation' => 'pendek',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['password']);
    }

    public function test_can_show_user(): void
    {
        $user = User::factory()->create(['name' => 'Siti Aminah']);

        $this->getJson("/api/master/users/{$user->id}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Siti Aminah')
            ->assertJsonPath('data.id', $user->id);
    }

    public function test_can_update_user(): void
    {
        $user = User::factory()->create(['name' => 'Lama', 'role' => 'Operator Gudang']);

        $this->putJson("/api/master/users/{$user->id}", [
            'name' => 'Baru',
            'email' => $user->email,
            'role' => 'Supervisor',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru')
            ->assertJsonPath('data.role', 'Supervisor');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Baru', 'role' => 'Supervisor']);
    }

    public function test_update_blank_password_keeps_existing(): void
    {
        $user = User::factory()->create(['password' => Hash::make('rahasia123')]);
        $original = $user->password;

        $this->putJson("/api/master/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'password' => '',
            'password_confirmation' => '',
        ])->assertOk();

        $this->assertSame($original, $user->fresh()->password);
    }

    public function test_can_update_password(): void
    {
        $user = User::factory()->create();

        $this->putJson("/api/master/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'password' => 'barubaru123',
            'password_confirmation' => 'barubaru123',
        ])->assertOk();

        $this->assertTrue(Hash::check('barubaru123', $user->fresh()->password));
    }

    public function test_can_deactivate_user(): void
    {
        $user = User::factory()->create(['is_active' => true]);

        $this->putJson("/api/master/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'is_active' => false]);
    }

    public function test_can_delete_user(): void
    {
        $user = User::factory()->create();

        $this->deleteJson("/api/master/users/{$user->id}")
            ->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }
}
