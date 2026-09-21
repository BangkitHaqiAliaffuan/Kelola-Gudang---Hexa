<?php

use App\Http\Controllers\AiAssistantController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BinController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\LaporanController;
use App\Http\Controllers\LaporanFastMovingController;
use App\Http\Controllers\MerkController;
use App\Http\Controllers\ProcDocController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\RackController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\StockDocumentController;
use App\Http\Controllers\SubCategoryController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\UnitController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VendorController;
use App\Http\Controllers\WarehouseController;
use App\Http\Controllers\WorkOrderController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'user.active']);
    Route::get('me', [AuthController::class, 'me'])->middleware(['auth:sanctum', 'user.active']);
});

Route::prefix('master')->middleware(['auth:sanctum', 'user.active', 'role.access:Master Data'])->group(function () {
    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('sub-categories', SubCategoryController::class);
    Route::apiResource('merks', MerkController::class);
    Route::apiResource('units', UnitController::class);
    Route::apiResource('warehouses', WarehouseController::class);
    Route::apiResource('racks', RackController::class);
    Route::apiResource('bins', BinController::class);
    Route::apiResource('suppliers', SupplierController::class);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('vendors', VendorController::class);
    Route::apiResource('departments', DepartmentController::class);
    Route::apiResource('projects', ProjectController::class);
    Route::apiResource('work-orders', WorkOrderController::class);
    Route::post('items/bulk-delete', [ItemController::class, 'bulkDestroy']);
    Route::post('items/bulk-status', [ItemController::class, 'bulkUpdateStatus']);
    Route::post('items/bulk-import', [ItemController::class, 'bulkImport'])->middleware('throttle:bulk');
    Route::get('items/cost-drift', [ItemController::class, 'costDrift']);
    Route::post('items/sync-cost', [ItemController::class, 'syncCost'])->middleware('throttle:bulk');
    Route::get('items/lookup', [ItemController::class, 'lookup']);
    Route::apiResource('items', ItemController::class);

    // Manajemen user & role — BACA (GET) tetap di bawah role.access agar form
    // non-admin (select PIC di PR/opname, halaman Role) tetap berfungsi.
    Route::get('users', [UserController::class, 'index']);
    Route::get('users/{user}', [UserController::class, 'show']);
    Route::get('roles', [RoleController::class, 'index']);

    // Manajemen user & role — TULIS hanya Administrator (cegah eskalasi
    // privilege: membuat Administrator baru / mengubah matriks hak akses).
    Route::middleware('role.administrator')->group(function () {
        Route::post('users', [UserController::class, 'store']);
        Route::put('users/{user}', [UserController::class, 'update']);
        Route::delete('users/{user}', [UserController::class, 'destroy']);
        Route::post('roles', [RoleController::class, 'store']);
        Route::put('roles/{role}', [RoleController::class, 'update']);
        Route::delete('roles/{role}', [RoleController::class, 'destroy']);
    });
});

Route::prefix('persediaan')->middleware(['auth:sanctum', 'user.active', 'role.access:Persediaan', 'scope.warehouse'])->group(function () {
    Route::get('stock', [StockController::class, 'index']);
    Route::get('stock-minimum', [StockController::class, 'stockMinimum']);
    Route::get('stock-card', [StockController::class, 'stockCard']);
    Route::get('valuation', [StockController::class, 'valuation']);
    Route::get('stock-documents', [StockDocumentController::class, 'index']);
    Route::post('stock-documents', [StockDocumentController::class, 'store'])->middleware('throttle:mutasi');
    Route::get('stock-documents/summary', [StockDocumentController::class, 'summary']);
    Route::get('stock-documents/{stockDocument}', [StockDocumentController::class, 'show']);
    Route::put('stock-documents/{stockDocument}', [StockDocumentController::class, 'update']);
    Route::post('stock-documents/{stockDocument}/post', [StockDocumentController::class, 'post']);
    Route::post('stock-documents/{stockDocument}/cancel', [StockDocumentController::class, 'cancel']);
    Route::post('stock-documents/{stockDocument}/submit-approval', [StockDocumentController::class, 'submitApproval']);
    Route::post('stock-documents/{stockDocument}/submit-review', [StockDocumentController::class, 'submitReview']);
    Route::post('stock-documents/{stockDocument}/lock', [StockDocumentController::class, 'lock']);
    Route::post('stock-documents/{stockDocument}/heartbeat', [StockDocumentController::class, 'heartbeat']);
    Route::post('stock-documents/{stockDocument}/unlock', [StockDocumentController::class, 'unlock']);
});

Route::prefix('persediaan')->middleware(['auth:sanctum', 'user.active'])->group(function () {
    Route::post('stock-documents/{stockDocument}/approve', [StockDocumentController::class, 'approve']);
    Route::post('stock-documents/{stockDocument}/reject', [StockDocumentController::class, 'reject']);
    Route::post('stock-documents/{stockDocument}/approve-review', [StockDocumentController::class, 'approveReview']);
    Route::post('stock-documents/{stockDocument}/reject-review', [StockDocumentController::class, 'rejectReview']);
    Route::post('stock-documents/{stockDocument}/force-unlock', [StockDocumentController::class, 'forceUnlock']);
});

Route::prefix('pengadaan')->middleware(['auth:sanctum', 'user.active', 'role.access:Pengadaan', 'scope.warehouse'])->group(function () {
    Route::get('proc-docs', [ProcDocController::class, 'index']);
    Route::post('proc-docs', [ProcDocController::class, 'store']);
    Route::get('proc-docs/{procDoc}', [ProcDocController::class, 'show'])->whereNumber('procDoc');
    Route::put('proc-docs/{procDoc}', [ProcDocController::class, 'update'])->whereNumber('procDoc');
    Route::delete('proc-docs/{procDoc}', [ProcDocController::class, 'destroy'])->whereNumber('procDoc');
    Route::post('proc-docs/{procDoc}/submit', [ProcDocController::class, 'submit'])->whereNumber('procDoc');
    Route::post('proc-docs/{procDoc}/cancel', [ProcDocController::class, 'cancel'])->whereNumber('procDoc');
    Route::post('proc-docs/{procDoc}/reassign', [ProcDocController::class, 'reassign'])->whereNumber('procDoc');
});

// Aksi approval hanya butuh auth:sanctum — hanya approver yang ditugaskan
// (approver_user_id) yang boleh memutuskan; reassign butuh Pengadaan Kelola.
Route::prefix('pengadaan')->middleware(['auth:sanctum', 'user.active'])->group(function () {
    Route::post('proc-docs/{procDoc}/approve', [ProcDocController::class, 'approve'])->whereNumber('procDoc');
    Route::post('proc-docs/{procDoc}/reject', [ProcDocController::class, 'reject'])->whereNumber('procDoc');
});

Route::prefix('laporan')->middleware(['auth:sanctum', 'user.active', 'role.access:Laporan', 'throttle:laporan', 'scope.warehouse'])->group(function () {
    Route::get('mutasi', [LaporanController::class, 'mutasi']);
    Route::get('keluar-analytics', [LaporanController::class, 'keluarAnalytics']);
    Route::get('transaksi-analytics', [LaporanController::class, 'transaksiAnalytics']);
    Route::get('fast-moving', [LaporanFastMovingController::class, 'index']);
});

Route::prefix('system')->middleware(['auth:sanctum', 'role.access:System'])->group(function () {
    Route::get('settings', [SettingController::class, 'index']);
    // Tulis pengaturan (profil perusahaan) hanya Administrator — mencegah
    // perubahan identitas/kop dokumen oleh role non-admin.
    Route::put('settings', [SettingController::class, 'update'])->middleware('role.administrator');
});

// AI Assistant (F8). Gate role.access:Persediaan diturunkan dari verb:
// endpoint POST (chat/execute/reject) butuh Tulis, endpoint GET cukup Baca.
// AI mewarisi izin user; setiap tool call dicek ulang ke role.
Route::prefix('ai')
    ->middleware(['auth:sanctum', 'user.active', 'scope.warehouse', 'role.access:Persediaan', 'throttle:ai'])
    ->group(function () {
        Route::get('status', [AiAssistantController::class, 'status']);
        Route::post('chat', [AiAssistantController::class, 'chat']);
        Route::post('execute', [AiAssistantController::class, 'execute']);
        Route::post('reject', [AiAssistantController::class, 'reject']);
        Route::get('proposals/{id}', [AiAssistantController::class, 'show'])->whereNumber('id');
    });
