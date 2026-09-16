<?php

namespace App\Providers;

use App\Observers\AuditObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        foreach (array_keys(AuditObserver::OBSERVED) as $model) {
            $model::observe(AuditObserver::class);
        }

        // Rute audit terpisah agar tidak tabrakan dengan sesi lain di routes/api.php.
        $this->loadRoutesFrom(base_path('routes/audit.php'));

        // Rate limit endpoint berat (F3.4). Nonaktif saat testing agar suite
        // tidak menabrak limit kumulatif (cache array persisten per proses);
        // bukti 429 ada di ThrottleTest via override limiter per-test.
        $testBypass = app()->runningUnitTests() ? Limit::none() : null;
        RateLimiter::for('mutasi', fn () => $testBypass ?? Limit::perMinute(60));
        RateLimiter::for('bulk', fn () => $testBypass ?? Limit::perMinute(10));
        RateLimiter::for('laporan', fn () => $testBypass ?? Limit::perMinute(60));
    }
}
