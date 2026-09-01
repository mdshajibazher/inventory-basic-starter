<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CurrencyController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerLedgerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DatewiseProductReportController;
use App\Http\Controllers\Api\EmailLogController;
use App\Http\Controllers\Api\ExpenseCategoryController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\GeneralSettingController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProfitReportController;
use App\Http\Controllers\Api\PurchaseInvoiceController;
use App\Http\Controllers\Api\PurchaseReturnController;
use App\Http\Controllers\Api\PurchaseStatusController;
use App\Http\Controllers\Api\ReturnInvoiceController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SalesInvoiceController;
use App\Http\Controllers\Api\SensitivePermissionController;
use App\Http\Controllers\Api\SmsLogController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\UnitGroupController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WarehouseController;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware(['auth:sanctum', 'active.user'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/branding', [GeneralSettingController::class, 'branding']);

    Route::get('/sensitive-permissions', [SensitivePermissionController::class, 'index'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::put('/roles/{role}/sensitive-permissions', [SensitivePermissionController::class, 'updateRole'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::put('/users/{user}/sensitive-permissions', [SensitivePermissionController::class, 'updateUser'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);

    Route::get('/users/options', [UserController::class, 'options'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::put('/users/{user}/roles', [UserController::class, 'updateRoles'])->middleware('effective.permission:users-index');
    Route::put('/users/{user}/permissions', [UserController::class, 'updatePermissions'])->middleware('effective.permission:users-index');
    Route::get('/users', [UserController::class, 'index'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::get('/users/{user}', [UserController::class, 'show'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::post('/users', [UserController::class, 'store'])->middleware('effective.permission:users-index');
    Route::match(['put', 'patch'], '/users/{user}', [UserController::class, 'update'])->middleware('effective.permission:users-index');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->middleware('effective.permission:users-index');
    Route::get('/roles/permissions', [RoleController::class, 'permissions'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::put('/roles/permissions/{permission}', [RoleController::class, 'updatePermission'])->middleware('effective.permission:users-index');
    Route::get('/roles', [RoleController::class, 'index'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::get('/roles/{role}', [RoleController::class, 'show'])->middleware('effective.permission:users-index|'.SensitivePermissionCatalog::SUPER_USER);
    Route::post('/roles', [RoleController::class, 'store'])->middleware('effective.permission:users-index');
    Route::match(['put', 'patch'], '/roles/{role}', [RoleController::class, 'update'])->middleware('effective.permission:users-index');
    Route::delete('/roles/{role}', [RoleController::class, 'destroy'])->middleware('effective.permission:users-index');

    Route::get('/customers/options', [CustomerController::class, 'options'])->middleware('permission:customers-index|customers-add|customers-edit');
    Route::get('/customers', [CustomerController::class, 'index'])->middleware('permission:customers-index');
    Route::post('/customers', [CustomerController::class, 'store'])->middleware('effective.permission:customers-add');
    Route::get('/customers/{customer}/ledger', CustomerLedgerController::class)->middleware('permission:customers-index');
    Route::get('/customers/{customer}/statement', [PaymentController::class, 'customerStatement'])->middleware('permission:customers-index');
    Route::get('/customers/{customer}', [CustomerController::class, 'show'])->middleware('permission:customers-index');
    Route::match(['put', 'patch'], '/customers/{customer}', [CustomerController::class, 'update'])->middleware('effective.permission:customers-edit');
    Route::delete('/customers/{customer}', [CustomerController::class, 'destroy'])->middleware('effective.permission:customers-delete');

    Route::get('/suppliers', [SupplierController::class, 'index'])->middleware('permission:suppliers-index');
    Route::post('/suppliers', [SupplierController::class, 'store'])->middleware('permission:suppliers-add');
    Route::get('/suppliers/{supplier}/statement', [PaymentController::class, 'supplierStatement'])->middleware('permission:suppliers-index');
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show'])->middleware('permission:suppliers-index');
    Route::match(['put', 'patch'], '/suppliers/{supplier}', [SupplierController::class, 'update'])->middleware('permission:suppliers-edit');
    Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy'])->middleware('permission:suppliers-delete');

    Route::get('/brands', [BrandController::class, 'index'])->middleware('permission:brands-index');
    Route::post('/brands', [BrandController::class, 'store'])->middleware('permission:brands-add');
    Route::get('/brands/{brand}', [BrandController::class, 'show'])->middleware('permission:brands-index');
    Route::match(['put', 'patch'], '/brands/{brand}', [BrandController::class, 'update'])->middleware('permission:brands-edit');
    Route::delete('/brands/{brand}', [BrandController::class, 'destroy'])->middleware('permission:brands-delete');

    Route::get('/branches', [BranchController::class, 'index'])->middleware('permission:branches-index');
    Route::post('/branches', [BranchController::class, 'store'])->middleware('permission:branches-add');
    Route::get('/branches/{branch}', [BranchController::class, 'show'])->middleware('permission:branches-index');
    Route::match(['put', 'patch'], '/branches/{branch}', [BranchController::class, 'update'])->middleware('permission:branches-edit');
    Route::delete('/branches/{branch}', [BranchController::class, 'destroy'])->middleware('permission:branches-delete');

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
    Route::delete('/units/{unit}', [UnitController::class, 'destroy'])->middleware('permission:units-delete');
    Route::get('/unit-groups', [UnitGroupController::class, 'index'])->middleware('permission:units-index|units-add');

    Route::get('/accounts', [AccountController::class, 'index'])->middleware('permission:accounts-index');
    Route::post('/accounts', [AccountController::class, 'store'])->middleware('permission:accounts-add');
    Route::get('/accounts/{account}/statement', [PaymentController::class, 'accountStatement'])->middleware('permission:accounts-index');
    Route::get('/accounts/{account}', [AccountController::class, 'show'])->middleware('permission:accounts-index');
    Route::match(['put', 'patch'], '/accounts/{account}', [AccountController::class, 'update'])->middleware('permission:accounts-edit');
    Route::delete('/accounts/{account}', [AccountController::class, 'destroy'])->middleware('permission:accounts-delete');

    Route::get('/expense-categories', [ExpenseCategoryController::class, 'index'])->middleware('permission:expenses-index|expenses-add|expenses-edit');
    Route::post('/expense-categories', [ExpenseCategoryController::class, 'store'])->middleware('permission:expenses-add');
    Route::get('/expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'show'])->middleware('permission:expenses-index');
    Route::match(['put', 'patch'], '/expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'update'])->middleware('permission:expenses-edit');
    Route::delete('/expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'destroy'])->middleware('permission:expenses-delete');
    Route::get('/expenses', [ExpenseController::class, 'index'])->middleware('permission:expenses-index');
    Route::post('/expenses', [ExpenseController::class, 'store'])->middleware('permission:expenses-add');
    Route::get('/expenses/{expense}', [ExpenseController::class, 'show'])->middleware('permission:expenses-index');
    Route::match(['put', 'patch'], '/expenses/{expense}', [ExpenseController::class, 'update'])->middleware('permission:expenses-edit');
    Route::delete('/expenses/{expense}', [ExpenseController::class, 'destroy'])->middleware('permission:expenses-delete');

    Route::get('/general-settings', [GeneralSettingController::class, 'index'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::post('/general-settings', [GeneralSettingController::class, 'store'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::get('/general-settings/{generalSetting}', [GeneralSettingController::class, 'show'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::match(['put', 'patch'], '/general-settings/{generalSetting}', [GeneralSettingController::class, 'update'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::get('/email-logs', [EmailLogController::class, 'index'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
    Route::get('/sms-logs', [SmsLogController::class, 'index'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);

    Route::get('/products/options', [ProductController::class, 'options'])->middleware('permission:products-index|products-add|products-edit');
    Route::get('/check-batch-availability/{product_id}/{batch_no}/{warehouse_id}', [ProductController::class, 'checkBatchAvailability'])
        ->whereNumber('product_id')
        ->whereNumber('warehouse_id')
        ->middleware('permission:sales-index|sales-add|sales-edit|purchases-index|purchases-add|purchases-edit');
    Route::get('/products', [ProductController::class, 'index'])->middleware('permission:products-index');
    Route::post('/products', [ProductController::class, 'store'])->middleware('permission:products-add');
    Route::get('/products/{product}/barcode', [ProductController::class, 'barcode'])->middleware('permission:products-index');
    Route::get('/products/{product}', [ProductController::class, 'show'])->middleware('permission:products-index|products-edit');
    Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update'])->middleware('permission:products-edit');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('permission:products-delete');

    Route::get('/product-stocks', [StockController::class, 'index'])->middleware('permission:product-stocks-index');
    Route::get('/products/{product}/stock-history', [StockController::class, 'history'])->middleware('permission:product-stocks-index');
    Route::post('/stock-adjustments', [StockController::class, 'storeBatchAdjustment'])->middleware('permission:product-stocks-adjust');
    Route::post('/products/{product}/stock-adjustments', [StockController::class, 'storeAdjustment'])->middleware('permission:product-stocks-adjust');
    Route::match(['put', 'patch'], '/stock-adjustments/{movement}', [StockController::class, 'updateAdjustment'])->middleware('permission:product-stocks-adjust');
    Route::delete('/stock-adjustments/{movement}', [StockController::class, 'destroyAdjustment'])->middleware('permission:product-stocks-adjust');

    Route::get('/transfers', [TransferController::class, 'index'])->middleware('permission:transfers-index|transfers-add|transfers-edit');
    Route::post('/transfers', [TransferController::class, 'store'])->middleware('permission:transfers-add');
    Route::get('/transfers/{transfer}', [TransferController::class, 'show'])->middleware('permission:transfers-index|transfers-add|transfers-edit|transfers-show');
    Route::match(['put', 'patch'], '/transfers/{transfer}', [TransferController::class, 'update'])->middleware('permission:transfers-edit');
    Route::delete('/transfers/{transfer}', [TransferController::class, 'destroy'])->middleware('permission:transfers-delete');

    Route::get('/sales-invoices', [SalesInvoiceController::class, 'index'])->middleware('permission:sales-index|sales-add|sales-edit');
    Route::post('/sales-invoices', [SalesInvoiceController::class, 'store'])->middleware('permission:sales-add');
    Route::get('/sales-invoices/{sale}/pdf', [SalesInvoiceController::class, 'pdf'])->middleware('permission:sales-index|sales-add|sales-edit');
    Route::get('/sales-invoices/{sale}', [SalesInvoiceController::class, 'show'])->middleware('permission:sales-index|sales-add|sales-edit');
    Route::match(['put', 'patch'], '/sales-invoices/{sale}', [SalesInvoiceController::class, 'update'])->middleware('permission:sales-edit');
    Route::patch('/sales-invoices/{sale}/lines/{productSale}/cost', [SalesInvoiceController::class, 'updateLineCost'])->middleware('permission:sales-edit');
    Route::post('/sales-invoices/{sale}/approve', [SalesInvoiceController::class, 'approve'])->middleware([
        'effective.permission:sales-index|sales-edit',
        'effective.permission:'.SensitivePermissionCatalog::APPROVAL_SALES_INVOICE,
    ]);
    Route::get('/return-invoices', [ReturnInvoiceController::class, 'index'])->middleware('permission:returns-index|returns-add|returns-edit');
    Route::post('/return-invoices', [ReturnInvoiceController::class, 'store'])->middleware('permission:returns-add');
    Route::get('/return-invoices/{returnInvoice}', [ReturnInvoiceController::class, 'show'])->middleware('permission:returns-index|returns-add|returns-edit|returns-show');
    Route::match(['put', 'patch'], '/return-invoices/{returnInvoice}', [ReturnInvoiceController::class, 'update'])->middleware('permission:returns-edit');
    Route::post('/return-invoices/{returnInvoice}/approve', [ReturnInvoiceController::class, 'approve'])->middleware([
        'effective.permission:returns-index|returns-edit|returns-show',
        'effective.permission:'.SensitivePermissionCatalog::APPROVAL_SALES_RETURN_INVOICE,
    ]);
    Route::get('/purchase-statuses', [PurchaseStatusController::class, 'index'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::get('/purchase-invoices', [PurchaseInvoiceController::class, 'index'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::post('/purchase-invoices', [PurchaseInvoiceController::class, 'store'])->middleware('permission:purchases-add');
    Route::get('/purchase-invoices/{purchase}/pdf', [PurchaseInvoiceController::class, 'pdf'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::get('/purchase-invoices/{purchase}', [PurchaseInvoiceController::class, 'show'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::match(['put', 'patch'], '/purchase-invoices/{purchase}', [PurchaseInvoiceController::class, 'update'])->middleware('permission:purchases-edit');
    Route::post('/purchase-invoices/{purchase}/approve', [PurchaseInvoiceController::class, 'approve'])->middleware([
        'effective.permission:purchases-index|purchases-edit',
        'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE,
    ]);
    Route::get('/purchase-return-invoices', [PurchaseReturnController::class, 'index'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::post('/purchase-return-invoices', [PurchaseReturnController::class, 'store'])->middleware('permission:purchases-add');
    Route::get('/purchase-return-invoices/{returnPurchase}', [PurchaseReturnController::class, 'show'])->middleware('permission:purchases-index|purchases-add|purchases-edit');
    Route::match(['put', 'patch'], '/purchase-return-invoices/{returnPurchase}', [PurchaseReturnController::class, 'update'])->middleware('permission:purchases-edit');
    Route::post('/purchase-return-invoices/{returnPurchase}/approve', [PurchaseReturnController::class, 'approve'])->middleware([
        'effective.permission:purchases-index|purchases-edit',
        'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PURCHASE_RETURN_INVOICE,
    ]);

    Route::get('/payments', [PaymentController::class, 'index'])->middleware('permission:sales-index|purchases-index|accounts-index');
    Route::post('/payments', [PaymentController::class, 'store'])->middleware('permission:sales-add|purchases-add|accounts-index');
    Route::get('/payments/{payment}', [PaymentController::class, 'show'])->middleware('permission:sales-index|purchases-index|accounts-index');
    Route::match(['put', 'patch'], '/payments/{payment}', [PaymentController::class, 'update'])->middleware('permission:sales-edit|purchases-edit|accounts-edit');
    Route::post('/payments/{payment}/approve', [PaymentController::class, 'approve'])->middleware([
        'effective.permission:sales-index|purchases-index|accounts-index',
        'effective.permission:'.SensitivePermissionCatalog::APPROVAL_PAYMENTS,
    ]);

    Route::get('/reports/profit', ProfitReportController::class)->middleware('permission:reports-profit');
    Route::get('/reports/profit/details', [ProfitReportController::class, 'details'])->middleware('permission:reports-profit');
    Route::get('/reports/profit/pdf', [ProfitReportController::class, 'pdf'])->middleware('permission:reports-profit');
    Route::get('/reports/datewise-products', DatewiseProductReportController::class)->middleware('permission:reports-profit');
    Route::get('/reports/datewise-products/pdf', [DatewiseProductReportController::class, 'pdf'])->middleware('permission:reports-profit');
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::post('/dashboard/clear-transactions', [DashboardController::class, 'clearTransactions'])->middleware('effective.permission:'.SensitivePermissionCatalog::SUPER_USER);
});
