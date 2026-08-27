<?php

use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$movements = StockMovement::with('stockDocument')
    ->whereHas('item', fn($q) => $q->where('sku', 'SKU-10001-009'))
    ->orderBy('occurred_at')
    ->orderBy('id')
    ->get()
    ->map(function ($m) {
        return [
            'id' => $m->id,
            'doc_no' => $m->stockDocument ? $m->stockDocument->no : null,
            'doc_date' => $m->stockDocument ? $m->stockDocument->document_date : null,
            'occurred_at' => $m->occurred_at->format('Y-m-d H:i:s'),
            'created_at' => $m->created_at->format('Y-m-d H:i:s'),
            'type' => $m->movement_type,
            'direction' => $m->direction,
            'qty' => $m->qty
        ];
    });

file_put_contents(__DIR__.'/movements.json', json_encode($movements, JSON_PRETTY_PRINT));
echo "Done.";
