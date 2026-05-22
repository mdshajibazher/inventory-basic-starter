<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;

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
}
