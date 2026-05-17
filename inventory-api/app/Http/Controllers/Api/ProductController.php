<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $products = Product::query()
            ->with('category:id,name')
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = $request->string('search');
                $query->where(function ($subQuery) use ($search) {
                    $subQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%");
                });
            })
            ->when($request->boolean('low_stock'), function ($query) {
                $query->whereNotNull('alert_quantity')
                    ->whereColumn('qty', '<=', 'alert_quantity');
            })
            ->latest()
            ->get();

        return response()->json([
            'data' => $products,
        ]);
    }

    public function store(Request $request)
    {
        $product = Product::create($request->validate([
            'name' => ['required', 'string', 'max:180'],
            'code' => ['required', 'string', 'max:255', 'unique:products,code'],
            'type' => ['required', 'string', 'max:255'],
            'barcode_symbology' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'unit_id' => ['required', 'integer', 'exists:units,id'],
            'purchase_unit_id' => ['required', 'integer', 'exists:units,id'],
            'sale_unit_id' => ['required', 'integer', 'exists:units,id'],
            'cost' => ['required', 'numeric', 'min:0'],
            'price' => ['required', 'numeric', 'min:0'],
            'qty' => ['nullable', 'numeric', 'min:0'],
            'alert_quantity' => ['nullable', 'numeric', 'min:0'],
            'promotion' => ['nullable', 'boolean'],
            'promotion_price' => ['nullable', 'numeric', 'min:0'],
            'starting_date' => ['nullable', 'date'],
            'last_date' => ['nullable', 'date', 'after_or_equal:starting_date'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'tax_method' => ['nullable', 'integer'],
            'image' => ['nullable', 'string'],
            'file' => ['nullable', 'string', 'max:255'],
            'featured' => ['nullable', 'boolean'],
            'product_details' => ['nullable', 'string'],
            'product_list' => ['nullable', 'string', 'max:255'],
            'qty_list' => ['nullable', 'string', 'max:255'],
            'price_list' => ['nullable', 'string', 'max:255'],
            'is_variant' => ['nullable', 'boolean'],
            'is_batch' => ['nullable', 'boolean'],
            'is_diffPrice' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
        ]));

        return response()->json([
            'message' => 'Product created successfully.',
            'data' => $product->load('category:id,name'),
        ], 201);
    }

    public function show(Product $product)
    {
        return response()->json([
            'data' => $product->load('category:id,name'),
        ]);
    }

    public function update(Request $request, Product $product)
    {
        $product->update($request->validate([
            'name' => ['required', 'string', 'max:180'],
            'code' => ['required', 'string', 'max:255', Rule::unique('products', 'code')->ignore($product->id)],
            'type' => ['required', 'string', 'max:255'],
            'barcode_symbology' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'unit_id' => ['required', 'integer', 'exists:units,id'],
            'purchase_unit_id' => ['required', 'integer', 'exists:units,id'],
            'sale_unit_id' => ['required', 'integer', 'exists:units,id'],
            'cost' => ['required', 'numeric', 'min:0'],
            'price' => ['required', 'numeric', 'min:0'],
            'qty' => ['nullable', 'numeric', 'min:0'],
            'alert_quantity' => ['nullable', 'numeric', 'min:0'],
            'promotion' => ['nullable', 'boolean'],
            'promotion_price' => ['nullable', 'numeric', 'min:0'],
            'starting_date' => ['nullable', 'date'],
            'last_date' => ['nullable', 'date', 'after_or_equal:starting_date'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'tax_method' => ['nullable', 'integer'],
            'image' => ['nullable', 'string'],
            'file' => ['nullable', 'string', 'max:255'],
            'featured' => ['nullable', 'boolean'],
            'product_details' => ['nullable', 'string'],
            'product_list' => ['nullable', 'string', 'max:255'],
            'qty_list' => ['nullable', 'string', 'max:255'],
            'price_list' => ['nullable', 'string', 'max:255'],
            'is_variant' => ['nullable', 'boolean'],
            'is_batch' => ['nullable', 'boolean'],
            'is_diffPrice' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
        ]));

        return response()->json([
            'message' => 'Product updated successfully.',
            'data' => $product->load('category:id,name'),
        ]);
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return response()->json([
            'message' => 'Product deleted successfully.',
        ]);
    }
}
