<?php
$countNull = \DB::table('stock_documents')->whereIn('type', ['Pengeluaran', 'Retur Penjualan'])->whereNull('customer_id')->count();

$mismatches = \DB::table('stock_documents')
    ->whereIn('type', ['Pengeluaran', 'Retur Penjualan'])
    ->whereNull('customer_id')
    ->whereNotNull('partner')
    ->whereNotExists(function($q) { 
        $q->select(\DB::raw(1))
          ->from('customers')
          ->whereColumn('customers.name', 'stock_documents.partner'); 
    })
    ->distinct()
    ->pluck('partner');

echo json_encode([
    'count_null_customer' => $countNull,
    'mismatched_partners' => $mismatches
], JSON_PRETTY_PRINT);
