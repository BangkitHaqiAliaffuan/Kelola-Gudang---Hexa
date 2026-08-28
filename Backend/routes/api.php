<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BinController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\MerkController;
use App\Http\Controllers\LaporanController;
use App\Http\Controllers\ProcDocController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\RackController;
use App\Http\Controllers\RoleController;
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
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('me', [AuthController::class, 'me'])->middleware('auth:sanctum');
});

Route::prefix('master')->middleware(['auth:sanctum', 'role.access:Master Data'])->group(function () {
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
    Route::apiResource('users', UserController::class);
    Route::get('roles', [RoleController::class, 'index']);
    Route::put('roles/{role}', [RoleController::class, 'update']);
    Route::apiResource('departments', DepartmentController::class);
    Route::apiResource('projects', ProjectController::class);
    Route::apiResource('work-orders', WorkOrderController::class);
    Route::post('items/bulk-delete', [ItemController::class, 'bulkDestroy']);
    Route::post('items/bulk-status', [ItemController::class, 'bulkUpdateStatus']);
    Route::apiResource('items', ItemController::class);
});

Route::prefix('persediaan')->middleware(['auth:sanctum', 'role.access:Persediaan'])->group(function () {
    Route::get('stock', [StockController::class, 'index']);
    Route::get('stock-minimum', [StockController::class, 'stockMinimum']);
    Route::get('stock-card', [StockController::class, 'stockCard']);
    Route::get('valuation', [StockController::class, 'valuation']);
    Route::get('stock-documents', [StockDocumentController::class, 'index']);
    Route::post('stock-documents', [StockDocumentController::class, 'store']);
    Route::get('stock-documents/summary', [StockDocumentController::class, 'summary']);
    Route::get('stock-documents/{stockDocument}', [StockDocumentController::class, 'show']);
    Route::put('stock-documents/{stockDocument}', [StockDocumentController::class, 'update']);
    Route::post('stock-documents/{stockDocument}/post', [StockDocumentController::class, 'post']);
    Route::post('stock-documents/{stockDocument}/cancel', [StockDocumentController::class, 'cancel']);
    Route::post('stock-documents/{stockDocument}/submit-approval', [StockDocumentController::class, 'submitApproval']);
    Route::post('stock-documents/{stockDocument}/submit-review', [StockDocumentController::class, 'submitReview']);
});

Route::prefix('persediaan')->middleware(['auth:sanctum'])->group(function () {
    Route::post('stock-documents/{stockDocument}/approve', [StockDocumentController::class, 'approve']);
    Route::post('stock-documents/{stockDocument}/reject', [StockDocumentController::class, 'reject']);
    Route::post('stock-documents/{stockDocument}/approve-review', [StockDocumentController::class, 'approveReview']);
    Route::post('stock-documents/{stockDocument}/reject-review', [StockDocumentController::class, 'rejectReview']);
});

Route::prefix('pengadaan')->middleware(['auth:sanctum', 'role.access:Pengadaan'])->group(function () {
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
Route::prefix('pengadaan')->middleware(['auth:sanctum'])->group(function () {
    Route::post('proc-docs/{procDoc}/approve', [ProcDocController::class, 'approve'])->whereNumber('procDoc');
    Route::post('proc-docs/{procDoc}/reject', [ProcDocController::class, 'reject'])->whereNumber('procDoc');
});

Route::prefix('laporan')->middleware(['auth:sanctum', 'role.access:Laporan'])->group(function () {
    Route::get('mutasi', [LaporanController::class, 'mutasi']);
});
