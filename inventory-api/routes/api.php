<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CurrencyController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WarehouseController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/users/options', [UserController::class, 'options'])->middleware('permission:users-index');
    Route::put('/users/{user}/roles', [UserController::class, 'updateRoles'])->middleware('permission:users-index');
    Route::put('/users/{user}/permissions', [UserController::class, 'updatePermissions'])->middleware('permission:users-index');
    Route::apiResource('users', UserController::class)->middleware('permission:users-index');
    Route::get('/roles/permissions', [RoleController::class, 'permissions'])->middleware('permission:users-index');
    Route::put('/roles/permissions/{permission}', [RoleController::class, 'updatePermission'])->middleware('permission:users-index');
    Route::apiResource('roles', RoleController::class)->middleware('permission:users-index');

    Route::get('/customers/options', [CustomerController::class, 'options'])->middleware('permission:customers-index|customers-add|customers-edit');
    Route::get('/customers', [CustomerController::class, 'index'])->middleware('permission:customers-index');
    Route::post('/customers', [CustomerController::class, 'store'])->middleware('permission:customers-add');
    Route::get('/customers/{customer}', [CustomerController::class, 'show'])->middleware('permission:customers-index');
    Route::match(['put', 'patch'], '/customers/{customer}', [CustomerController::class, 'update'])->middleware('permission:customers-edit');
    Route::delete('/customers/{customer}', [CustomerController::class, 'destroy'])->middleware('permission:customers-delete');

    Route::get('/brands', [BrandController::class, 'index'])->middleware('permission:brands-index');
    Route::post('/brands', [BrandController::class, 'store'])->middleware('permission:brands-add');
    Route::get('/brands/{brand}', [BrandController::class, 'show'])->middleware('permission:brands-index');
    Route::match(['put', 'patch'], '/brands/{brand}', [BrandController::class, 'update'])->middleware('permission:brands-edit');
    Route::delete('/brands/{brand}', [BrandController::class, 'destroy'])->middleware('permission:brands-delete');

    Route::get('/categories', [CategoryController::class, 'index'])->middleware('permission:categories-index');
    Route::post('/categories', [CategoryController::class, 'store'])->middleware('permission:categories-add');
    Route::get('/categories/{category}', [CategoryController::class, 'show'])->middleware('permission:categories-index');
    Route::match(['put', 'patch'], '/categories/{category}', [CategoryController::class, 'update'])->middleware('permission:categories-edit');
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->middleware('permission:categories-delete');

    Route::get('/currencies', [CurrencyController::class, 'index'])->middleware('permission:currencies-index');
    Route::post('/currencies', [CurrencyController::class, 'store'])->middleware('permission:currencies-add');
    Route::get('/currencies/{currency}', [CurrencyController::class, 'show'])->middleware('permission:currencies-index');
    Route::match(['put', 'patch'], '/currencies/{currency}', [CurrencyController::class, 'update'])->middleware('permission:currencies-edit');
    Route::delete('/currencies/{currency}', [CurrencyController::class, 'destroy'])->middleware('permission:currencies-delete');

    Route::get('/warehouses', [WarehouseController::class, 'index'])->middleware('permission:warehouses-index');
    Route::post('/warehouses', [WarehouseController::class, 'store'])->middleware('permission:warehouses-add');
    Route::get('/warehouses/{warehouse}', [WarehouseController::class, 'show'])->middleware('permission:warehouses-index');
    Route::match(['put', 'patch'], '/warehouses/{warehouse}', [WarehouseController::class, 'update'])->middleware('permission:warehouses-edit');
    Route::delete('/warehouses/{warehouse}', [WarehouseController::class, 'destroy'])->middleware('permission:warehouses-delete');

    Route::get('/taxes', [TaxController::class, 'index'])->middleware('permission:taxes-index');
    Route::post('/taxes', [TaxController::class, 'store'])->middleware('permission:taxes-add');
    Route::get('/taxes/{tax}', [TaxController::class, 'show'])->middleware('permission:taxes-index');
    Route::match(['put', 'patch'], '/taxes/{tax}', [TaxController::class, 'update'])->middleware('permission:taxes-edit');
    Route::delete('/taxes/{tax}', [TaxController::class, 'destroy'])->middleware('permission:taxes-delete');

    Route::get('/units', [UnitController::class, 'index'])->middleware('permission:units-index');
    Route::post('/units', [UnitController::class, 'store'])->middleware('permission:units-add');
    Route::get('/units/{unit}', [UnitController::class, 'show'])->middleware('permission:units-index');
    Route::match(['put', 'patch'], '/units/{unit}', [UnitController::class, 'update'])->middleware('permission:units-edit');
    Route::delete('/units/{unit}', [UnitController::class, 'destroy'])->middleware('permission:units-delete');
    Route::get('/products/options', [ProductController::class, 'options'])->middleware('permission:products-index|products-add|products-edit');
    Route::get('/products', [ProductController::class, 'index'])->middleware('permission:products-index');
    Route::post('/products', [ProductController::class, 'store'])->middleware('permission:products-add');
    Route::get('/products/{product}', [ProductController::class, 'show'])->middleware('permission:products-index');
    Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update'])->middleware('permission:products-edit');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('permission:products-delete');

    Route::get('/dashboard', [DashboardController::class, 'index']);
});
