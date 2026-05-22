<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\UnitController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/roles/permissions', [RoleController::class, 'permissions'])->middleware('permission:users-index');
    Route::apiResource('roles', RoleController::class)->middleware('permission:users-index');

    Route::apiResource('brands', BrandController::class)->middleware('permission:brand');
    Route::apiResource('categories', CategoryController::class)->middleware('permission:category');
    Route::apiResource('units', UnitController::class)->middleware('permission:unit');
    Route::get('/products/options', [ProductController::class, 'options'])->middleware('permission:products-index|products-add|products-edit');
    Route::get('/products', [ProductController::class, 'index'])->middleware('permission:products-index');
    Route::post('/products', [ProductController::class, 'store'])->middleware('permission:products-add');
    Route::get('/products/{product}', [ProductController::class, 'show'])->middleware('permission:products-index');
    Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update'])->middleware('permission:products-edit');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('permission:products-delete');

    Route::get('/dashboard', [DashboardController::class, 'index']);
});
