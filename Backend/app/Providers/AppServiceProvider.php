<?php

namespace App\Providers;

use App\Observers\AuditObserver;
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
    }
}
