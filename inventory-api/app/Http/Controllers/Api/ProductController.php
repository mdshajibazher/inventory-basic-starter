<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Tax;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return ProductResource::collection(Product::query()
            ->with([
                'brand:id,title',
                'category:id,name',
                'unit:id,unit_code,unit_name',
                'purchaseUnit:id,unit_code,unit_name',
                'saleUnit:id,unit_code,unit_name',
                'tax:id,name,rate',
            ])
            ->where('is_active', true)
            ->when($request->filled('search'), function ($query) use ($request) {
                $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                foreach ($terms as $term) {
                    $query->where(function ($subQuery) use ($term) {
                        $subQuery->where('name', 'like', "%{$term}%")
                            ->orWhere('code', 'like', "%{$term}%")
                            ->orWhere('type', 'like', "%{$term}%")
                            ->orWhereHas('category', fn ($categoryQuery) => $categoryQuery->where('name', 'like', "%{$term}%"))
                            ->orWhereHas('brand', fn ($brandQuery) => $brandQuery->where('title', 'like', "%{$term}%"));
                    });
                }
            })
            ->when($request->boolean('low_stock'), function ($query) {
                $query->whereNotNull('alert_quantity')
                    ->whereColumn('qty', '<=', 'alert_quantity');
            })
            ->latest()
            ->paginate($perPage)
            ->withQueryString());
    }

    public function options()
    {
        return response()->json([
            'data' => [
                'types' => ['standard', 'combo', 'digital'],
                'barcode_symbologies' => ['C128', 'C39', 'UPCA', 'UPCE', 'EAN8', 'EAN13'],
                'tax_methods' => [
                    ['id' => 1, 'name' => 'Exclusive'],
                    ['id' => 2, 'name' => 'Inclusive'],
                ],
                'brands' => Brand::query()->where('is_active', true)->orderBy('title')->get(['id', 'title']),
                'categories' => Category::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
                'units' => Unit::query()->where('is_active', true)->orderBy('unit_name')->get([
                    'id',
                    'unit_code',
                    'unit_name',
                    'base_unit',
                    'operator',
                    'operation_value',
                ]),
                'taxes' => Tax::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'rate']),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request);

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('products', 'public');
        } elseif (empty($data['image'])) {
            $data['image'] = 'zummXD2dvAtI.png';
        }

        $product = Product::create($data);

        return response()->json([
            'message' => 'Product created successfully.',
            'data' => new ProductResource($product->load($this->relations())),
        ], 201);
    }

    public function show(Product $product)
    {
        return response()->json([
            'data' => new ProductResource($product->load($this->relations())),
        ]);
    }

    public function update(Request $request, Product $product)
    {
        $data = $this->validatedData($request, $product);

        if ($request->boolean('remove_image') && $product->image) {
            $this->deleteStoredImage($product->image);
            $data['image'] = null;
        }

        if ($request->hasFile('image')) {
            $this->deleteStoredImage($product->image);
            $data['image'] = $request->file('image')->store('products', 'public');
        }

        unset($data['remove_image']);

        $product->update($data);

        return response()->json([
            'message' => 'Product updated successfully.',
            'data' => new ProductResource($product->load($this->relations())),
        ]);
    }

    public function destroy(Product $product)
    {
        $product->update(['is_active' => false]);

        return response()->json([
            'message' => 'Product deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Product $product = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'code' => [
                'required',
                'string',
                'max:255',
                Rule::unique('products', 'code')->where('is_active', true)->ignore($product?->id),
            ],
            'type' => ['required', 'string', Rule::in(['standard', 'combo', 'digital'])],
            'barcode_symbology' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'unit_id' => ['nullable', 'integer', 'exists:units,id'],
            'purchase_unit_id' => ['nullable', 'integer', 'exists:units,id'],
            'sale_unit_id' => ['nullable', 'integer', 'exists:units,id'],
            'cost' => ['required', 'numeric', 'min:0'],
            'price' => ['required', 'numeric', 'min:0'],
            'qty' => ['nullable', 'numeric', 'min:0'],
            'alert_quantity' => ['nullable', 'numeric', 'min:0'],
            'promotion' => ['nullable', 'boolean'],
            'promotion_price' => ['nullable', 'numeric', 'min:0'],
            'starting_date' => ['nullable', 'date'],
            'last_date' => ['nullable', 'date', 'after_or_equal:starting_date'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'tax_method' => ['nullable', 'integer', Rule::in([1, 2])],
            'image' => ['nullable', 'image', 'max:2048'],
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
        ]);

        $data['name'] = htmlspecialchars(trim($data['name']));
        $data['product_details'] = isset($data['product_details'])
            ? str_replace('"', '@', $data['product_details'])
            : null;
        $data['is_active'] = $data['is_active'] ?? true;
        $data['tax_method'] = $data['tax_method'] ?? 1;
        $data['featured'] = $data['featured'] ?? false;
        $data['promotion'] = $data['promotion'] ?? null;
        $data['is_variant'] = $data['is_variant'] ?? null;
        $data['is_batch'] = $data['is_batch'] ?? null;
        $data['is_diffPrice'] = $data['is_diffPrice'] ?? null;

        if (in_array($data['type'], ['combo', 'digital'], true)) {
            $data['cost'] = 0;
            $data['unit_id'] = 0;
            $data['purchase_unit_id'] = 0;
            $data['sale_unit_id'] = 0;
        }

        return $data;
    }

    private function relations(): array
    {
        return [
            'brand:id,title',
            'category:id,name',
            'unit:id,unit_code,unit_name',
            'purchaseUnit:id,unit_code,unit_name',
            'saleUnit:id,unit_code,unit_name',
            'tax:id,name,rate',
        ];
    }

    private function deleteStoredImage(?string $image): void
    {
        if (!$image) {
            return;
        }

        foreach (explode(',', $image) as $path) {
            $path = trim($path);

            if ($path && str_contains($path, '/')) {
                Storage::disk('public')->delete($path);
            }
        }
    }
}
