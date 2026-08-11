<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_success_returns_user_and_access(): void
    {
        $user = User::factory()->create([
            'email' => 'rudi@kelolagudang.id',
            'password' => 'IndomieGoreng',
            'role' => 'Administrator',
        ]);
        RolePermission::create(['role' => 'Administrator', 'module' => 'Master Data', 'level' => 'Kelola']);

        $this->postJson('/api/auth/login', [
            'email' => 'rudi@kelolagudang.id',
            'password' => 'IndomieGoreng',
        ])
            ->assertOk()
            ->assertJsonStructure(['data', 'access', 'token'])
            ->assertJsonPath('data.email', 'rudi@kelolagudang.id')
            ->assertJsonPath('data.role', 'Administrator')
            ->assertJsonPath('access.0.module', 'Master Data');
    }

    public function test_login_wrong_password_rejected(): void
    {
        User::factory()->create([
            'email' => 'rudi@kelolagudang.id',
            'password' => 'IndomieGoreng',
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'rudi@kelolagudang.id',
            'password' => 'salah123',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    }

    public function test_login_unknown_email_rejected(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'tidak.ada@kelolagudang.id',
            'password' => 'IndomieGoreng',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    }

    public function test_login_inactive_user_rejected(): void
    {
        User::factory()->create([
            'email' => 'rudi@kelolagudang.id',
            'password' => 'IndomieGoreng',
            'is_active' => false,
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'rudi@kelolagudang.id',
            'password' => 'IndomieGoreng',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    }

    public function test_login_requires_email_and_password(): void
    {
        $this->postJson('/api/auth/login', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_is_rate_limited(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x']);
        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x']);
        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x']);
        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x']);
        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x']);

        $this->postJson('/api/auth/login', ['email' => 'a@b.id', 'password' => 'x'])
            ->assertStatus(429);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = User::factory()->create(['role' => 'Supervisor']);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => 'Baca']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonPath('data.role', 'Supervisor')
            ->assertJsonPath('access.0.module', 'Master Data');
    }

    public function test_logout_requires_authentication(): void
    {
        $this->postJson('/api/auth/logout')->assertUnauthorized();
    }

    public function test_logout_succeeds_when_authenticated(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Berhasil keluar.');
    }

    public function test_logout_revokes_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();

        // Guard mem-memoize user antar request dalam satu test; reset agar dibaca ulang dari DB.
        Auth::forgetGuards();

        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_master_routes_require_authentication(): void
    {
        $this->getJson('/api/master/categories')->assertUnauthorized();
    }

    public function test_master_routes_deny_role_without_master_access(): void
    {
        $user = User::factory()->create(['role' => 'Auditor']);
        RolePermission::create(['role' => 'Auditor', 'module' => 'Transaksi', 'level' => 'Baca']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/master/categories')
            ->assertForbidden();
    }

    public function test_master_routes_allow_full_master_access(): void
    {
        $user = User::factory()->create(['role' => 'Administrator']);
        RolePermission::create(['role' => 'Administrator', 'module' => 'Master Data', 'level' => 'Kelola']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/master/categories')
            ->assertOk();
    }

    public function test_role_permissions_are_exposed_for_login_user(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $user = User::factory()->create(['role' => 'Supervisor', 'password' => 'IndomieGoreng']);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'IndomieGoreng',
        ])
            ->assertOk()
            ->assertJsonPath('access.0.module', 'Master Data')
            ->assertJsonPath('access.0.level', 'Baca');
    }

    public function test_seeded_user_password_matches(): void
    {
        $user = User::factory()->create(['password' => 'IndomieGoreng']);
        $this->assertTrue(Hash::check('IndomieGoreng', $user->password));
    }
}
