<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Services\ApprovalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class DashboardController extends Controller
{
    public function pendingApprovals(Request $request, string $type, ApprovalService $approvals)
    {
        $controller = match ($type) {
            'sales' => SalesInvoiceController::class,
            'returns' => ReturnInvoiceController::class,
            'purchases' => PurchaseInvoiceController::class,
            'purchase_returns' => PurchaseReturnController::class,
            'payments' => PaymentController::class,
            default => abort(404),
        };

        $approvals->assertCanApprove($request->user(), $type);
        $pagination = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        // Reuse each list's resource and branch scope, with only pending pagination inputs.
        $request->query->replace([
            'page' => (int) ($pagination['page'] ?? 1),
            'per_page' => (int) ($pagination['per_page'] ?? 10),
            'approval_status' => ApprovalService::PENDING,
        ]);
        $request->request->replace([]);

        return app()->call([app($controller), 'index'], ['request' => $request]);
    }

    public function index()
    {
        return response()->json([
            'data' => [
                'total_categories' => Category::count(),
                'total_products' => Product::count(),
                'total_quantity' => Product::sum('qty'),
                'low_stock_products' => 0, // TODO in future
                'recent_movements' => 0, // TODO in future
            ],
        ]);
    }

    public function clearTransactions()
    {
        Artisan::call('inventory:clear-transactions', [
            '--force' => true,
        ]);

        return response()->json([
            'message' => 'Transactional inventory data cleared.',
            'output' => trim(Artisan::output()),
        ]);
    }
}
