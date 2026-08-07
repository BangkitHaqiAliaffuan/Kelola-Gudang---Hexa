<?php

use App\Http\Controllers\BinController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\MerkController;
use App\Http\Controllers\RackController;
use App\Http\Controllers\SubCategoryController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\UnitController;
use App\Http\Controllers\VendorController;
use App\Http\Controllers\WarehouseController;
use Illuminate\Support\Facades\Route;

Route::prefix('master')->group(function () {
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
    Route::post('items/bulk-delete', [ItemController::class, 'bulkDestroy']);
    Route::post('items/bulk-status', [ItemController::class, 'bulkUpdateStatus']);
    Route::apiResource('items', ItemController::class);
});
