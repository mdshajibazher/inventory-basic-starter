<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockController extends Controller
{
    public function stockIn(Request $request)
    {
        return $this->moveStock($request, 'in');
    }

    public function stockOut(Request $request)
    {
        return $this->moveStock($request, 'out');
    }

    public function movements()
    {
        return response()->json([
            'data' => StockMovement::query()
                ->with([
                    'product:id,name,sku',
                    'user:id,name,email',
                ])
                ->latest()
                ->limit(100)
                ->get(),
        ]);
    }

    private function moveStock(Request $request, string $type)
    {
        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);

        $movement = DB::transaction(function () use ($request, $validated, $type) {
            $product = Product::query()->lockForUpdate()->findOrFail($validated['product_id']);

            $before = $product->quantity;
            $after = $type === 'in'
                ? $before + $validated['quantity']
                : $before - $validated['quantity'];

            if ($after < 0) {
                throw ValidationException::withMessages([
                    'quantity' => ['Stock out quantity cannot exceed current stock.'],
                ]);
            }

            $product->update([
                'quantity' => $after,
            ]);

            return StockMovement::create([
                'product_id' => $product->id,
                'user_id' => $request->user()->id,
                'type' => $type,
                'quantity' => $validated['quantity'],
                'before_quantity' => $before,
                'after_quantity' => $after,
                'note' => $validated['note'] ?? null,
            ])->load([
                'product:id,name,sku',
                'user:id,name,email',
            ]);
        });

        return response()->json([
            'message' => strtoupper($type) . ' stock movement completed.',
            'data' => $movement,
        ], 201);
    }
}
