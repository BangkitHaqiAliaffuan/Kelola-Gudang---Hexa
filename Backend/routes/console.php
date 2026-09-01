<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('rebuild:drift', function () {
    $affected = [193, 293, 3, 50, 54, 183, 211, 224];
    $ledger = app(App\Services\StockLedger::class);
    $i = 0;
    foreach ($affected as $id) {
        if (\App\Models\Item::find($id)) {
            $ledger->rebuildForItem($id);
            $i++;
        }
    }
    $this->info("Rebuilt $i items");
});

