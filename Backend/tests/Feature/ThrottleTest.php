<?php

namespace Tests\Feature;

use App\Models\Item;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Bukti rate limit endpoint berat (F3.4).
 *
 * Limiter produksi (60/10/60 per menit) dinonaktifkan saat testing
 * (`Limit::none()` di AppServiceProvider) agar suite tidak menabrak limit
 * kumulatif; tiap test di sini meng-override limiternya sendiri ke
 * perMinute(1) lalu membuktikan request ke-2 → 429.
 */
class ThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        // Kembalikan bypass testing agar override per-test tidak bocor ke
        // test lain dalam proses yang sama (cache array persisten).
        RateLimiter::for('mutasi', fn () => Limit::none());
        RateLimiter::for('bulk', fn () => Limit::none());
        RateLimiter::for('laporan', fn () => Limit::none());

        parent::tearDown();
    }

    public function test_bulk_endpoints_are_throttled(): void
    {
        RateLimiter::for('bulk', fn () => Limit::perMinute(1));
        $this->actingAsMasterAdmin();
        $item = Item::factory()->create();

        $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]])->assertOk();
        $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]])->assertStatus(429);
    }

    public function test_mutasi_store_is_throttled(): void
    {
        RateLimiter::for('mutasi', fn () => Limit::perMinute(1));
        $this->actingAsMasterAdmin();

        // Payload kosong → 422 (lolos throttle, gagal validasi) membuktikan
        // request pertama tidak dibatasi; request kedua → 429.
        $this->postJson('/api/persediaan/stock-documents', [])->assertUnprocessable();
        $this->postJson('/api/persediaan/stock-documents', [])->assertStatus(429);
    }

    public function test_laporan_endpoints_are_throttled(): void
    {
        RateLimiter::for('laporan', fn () => Limit::perMinute(1));
        $this->actingAsMasterAdmin();

        $this->getJson('/api/laporan/mutasi')->assertUnprocessable();
        $this->getJson('/api/laporan/mutasi')->assertStatus(429);
    }
}
