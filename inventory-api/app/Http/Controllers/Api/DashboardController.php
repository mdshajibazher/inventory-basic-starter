<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Support\Facades\Artisan;

class DashboardController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => [
                'total_categories' => Category::count(),
                'total_products' => Product::count(),
                'total_quantity' => Product::sum('qty'),
                'low_stock_products' => 0, //TODO in future
                'recent_movements' => 0, //TODO in future
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
