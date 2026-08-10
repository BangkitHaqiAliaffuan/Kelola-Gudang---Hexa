<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConfigureCrossSiteCookieTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_origin_keeps_lax_non_secure_cookie(): void
    {
        config([
            'cors.allowed_origins' => ['http://localhost:8080', 'https://kelola-gudang-hexa.vercel.app'],
        ]);

        $response = $this->getJson('/sanctum/csrf-cookie', ['Origin' => 'http://localhost:8080']);

        $response->assertNoContent();
        $cookies = $response->headers->getCookies();
        $this->assertNotEmpty($cookies);

        foreach ($cookies as $cookie) {
            $this->assertSame('lax', $cookie->getSameSite());
            $this->assertFalse($cookie->isSecure());
            $this->assertContains($cookie->getDomain(), ['', null], true);
        }
    }

    public function test_remote_origin_flips_cookie_to_none_and_secure(): void
    {
        config([
            'cors.allowed_origins' => ['http://localhost:8080', 'https://kelola-gudang-hexa.vercel.app'],
        ]);

        $response = $this->getJson('/sanctum/csrf-cookie', ['Origin' => 'https://kelola-gudang-hexa.vercel.app']);

        $response->assertNoContent();
        $cookies = $response->headers->getCookies();
        $this->assertNotEmpty($cookies);

        foreach ($cookies as $cookie) {
            $this->assertSame('none', $cookie->getSameSite());
            $this->assertTrue($cookie->isSecure());
            $this->assertContains($cookie->getDomain(), ['', null], true);
        }
    }

    public function test_unknown_origin_is_treated_as_local(): void
    {
        config([
            'cors.allowed_origins' => ['http://localhost:8080'],
        ]);

        $response = $this->getJson('/sanctum/csrf-cookie', ['Origin' => 'http://evil.example.test']);

        $response->assertNoContent();
        foreach ($response->headers->getCookies() as $cookie) {
            $this->assertSame('lax', $cookie->getSameSite());
            $this->assertFalse($cookie->isSecure());
        }
    }
}
