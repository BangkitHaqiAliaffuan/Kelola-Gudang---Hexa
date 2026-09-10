<?php

use App\Http\Controllers\AuditLogController;
use Illuminate\Support\Facades\Route;

// Rute audit terpisah dari routes/api.php (klaim sesi lain).
// Prefix + middleware meniru withRouting(api): /api + grup middleware api.
Route::prefix('api/system')->middleware(['api', 'auth:sanctum', 'role.access:Audit Trails'])->group(function () {
    Route::get('audit-logs', [AuditLogController::class, 'index']);
});
