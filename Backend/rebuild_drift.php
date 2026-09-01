<?php
$affected = [193, 293, 3, 50, 54, 183, 211, 224];
$ledger = app(App\Services\StockLedger::class);
$i = 0;
foreach ($affected as $id) {
    if (\App\Models\Item::find($id)) {
        $ledger->rebuildForItem($id);
        $i++;
    }
}
echo "Rebuilt $i items\n";
