<?php

use App\Models\StockDocument;
use App\Services\StockDocumentService;
use Illuminate\Support\Facades\DB;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$service = app(StockDocumentService::class);

$zombies = StockDocument::where('status', 'Selesai')
    ->where(function($q) {
        $q->whereNull('posted_at')
          ->orWhereDoesntHave('movements');
    })
    ->get();

$result = [
    'total' => $zombies->count(),
    'documents' => [],
    'success' => 0,
    'failed' => []
];

foreach ($zombies as $doc) {
    if ($doc->type === 'Stock Opname') {
        // Opname normally doesn't move stock just freeze, but actually it creates adjustment movements
    }
    
    try {
        DB::transaction(function() use ($service, $doc) {
            $service->post($doc);
        });
        $result['success']++;
        $result['documents'][] = $doc->no . ' (Fixed)';
    } catch (\Exception $e) {
        $result['failed'][] = $doc->no . ' (Dihapus): ' . $e->getMessage();
        DB::transaction(function() use ($doc) {
            $doc->lines()->delete();
            $doc->delete();
        });
    }
}

file_put_contents(__DIR__.'/fix-result.json', json_encode($result, JSON_PRETTY_PRINT));
echo "Selesai. Hasil ditulis ke fix-result.json";

