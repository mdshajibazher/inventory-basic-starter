<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\GeneralSetting;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\ProductWarehouse;
use App\Models\Tax;
use App\Models\Unit;
use App\Models\Variant;
use App\Models\Warehouse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Milon\Barcode\Facades\DNS1DFacade as DNS1D;
use Throwable;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        logger([
            'request' => $request->all(),
        ]);

        return ProductResource::collection(Product::query()
            ->with([
                'brand:id,title',
                'category:id,name',
                'unit:id,unit_code,unit_name',
                'purchaseUnit:id,unit_code,unit_name',
                'saleUnit:id,unit_code,unit_name',
                'tax:id,name,rate',
                'variants.variant:id,name',
                'warehousePrices.warehouse:id,name',
                'warehouseStocks.warehouse:id,name',
                'warehouseStocks.batch:id,batch_no,expired_date',
            ])
            ->where('is_active', true)
            ->when($request->filled('search'), function ($query) use ($request) {
                $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);
                $likeOperator = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

                foreach ($terms as $term) {
                    $query->where(function ($subQuery) use ($term, $likeOperator) {
                        $subQuery->where('name', $likeOperator, "%{$term}%")
                            ->orWhere('code', $likeOperator, "%{$term}%")
                            ->orWhere('type', $likeOperator, "%{$term}%")
                            ->orWhereHas('variants', function ($variantQuery) use ($term, $likeOperator) {
                                $variantQuery->where('item_code', $likeOperator, "%{$term}%")
                                    ->orWhereHas('variant', fn ($nameQuery) => $nameQuery->where('name', $likeOperator, "%{$term}%"));
                            })
                            ->orWhereHas('category', fn ($categoryQuery) => $categoryQuery->where('name', $likeOperator, "%{$term}%"))
                            ->orWhereHas('brand', fn ($brandQuery) => $brandQuery->where('title', $likeOperator, "%{$term}%"));
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
                'units' => Unit::query()->where('is_active', true)->orderBy('unit_name')->get([
                    'id',
                    'unit_code',
                    'unit_name',
                    'base_unit',
                    'operator',
                    'operation_value',
                ]),
                'taxes' => Tax::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'rate']),
                'warehouses' => Warehouse::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            ],
        ]);
    }

    public function checkBatchAvailability(int $productId, string $batchNo, int $warehouseId)
    {
        $batch = ProductBatch::query()
            ->where('product_id', $productId)
            ->where('batch_no', $batchNo)
            ->first();

        if (! $batch) {
            return response()->json([
                'data' => [
                    'valid' => false,
                    'qty' => 0,
                    'product_batch_id' => null,
                    'message' => 'Wrong Batch Number!',
                ],
            ]);
        }

        $warehouseStock = ProductWarehouse::query()
            ->where('product_batch_id', $batch->id)
            ->where('warehouse_id', $warehouseId)
            ->first();

        if (! $warehouseStock) {
            return response()->json([
                'data' => [
                    'valid' => false,
                    'qty' => 0,
                    'product_batch_id' => $batch->id,
                    'message' => 'This Batch does not exist in the selected warehouse!',
                ],
            ]);
        }

        return response()->json([
            'data' => [
                'valid' => true,
                'qty' => $warehouseStock->qty,
                'product_batch_id' => $batch->id,
                'message' => 'ok',
            ],
        ]);
    }

    public function barcode(Request $request, Product $product)
    {
        abort_unless($product->is_active, 404);

        $data = $request->validate([
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
        ]);

        $variant = null;
        if (! empty($data['variant_id'])) {
            $variant = ProductVariant::query()
                ->with('variant:id,name')
                ->where('product_id', $product->id)
                ->findOrFail($data['variant_id']);
        }

        $code = $variant?->item_code ?: $product->code;
        $name = $variant
            ? trim($product->name.' - '.($variant->variant?->name ?: $variant->item_code))
            : $product->name;
        $price = (float) $product->price + (float) ($variant?->additional_price ?? 0);
        $settings = GeneralSetting::query()->latest()->first();

        try {
            $barcodeImage = DNS1D::getBarcodePNG($code, $product->barcode_symbology);
            $barcodeMime = 'image/png';

            if (! $barcodeImage) {
                $barcodeImage = base64_encode(DNS1D::getBarcodeSVG($code, $product->barcode_symbology));
                $barcodeMime = 'image/svg+xml';
            }
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Unable to generate barcode for this product code and symbology.',
            ], 422);
        }

        return response()->json([
            'data' => [
                'product_id' => $product->id,
                'variant_id' => $variant?->id,
                'name' => $name,
                'code' => $code,
                'price' => $price,
                'promotion_price' => $product->promotion_price,
                'barcode_symbology' => $product->barcode_symbology,
                'barcode_image' => $barcodeImage,
                'barcode_mime' => $barcodeMime,
                'currency' => $settings?->currency,
                'currency_position' => $settings?->currency_position ?: 'prefix',
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

        $product = DB::transaction(function () use ($data, $request) {
            $product = Product::create($data);
            $this->syncVariants($product, $request);
            $this->syncWarehousePrices($product, $request);

            return $product;
        });

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
        $this->enforceUnitIdLock($product, $data);

        if ($request->boolean('remove_image') && $product->image) {
            $this->deleteStoredImage($product->image);
            $data['image'] = null;
        }

        if ($request->hasFile('image')) {
            $this->deleteStoredImage($product->image);
            $data['image'] = $request->file('image')->store('products', 'public');
        }

        unset($data['remove_image']);

        DB::transaction(function () use ($product, $data, $request) {
            $product->update($data);
            $this->syncVariants($product, $request);
            $this->syncWarehousePrices($product, $request);
        });

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
        if ($request->has('qty')) {
            throw ValidationException::withMessages([
                'qty' => ['Product stock can only be changed through purchases or stock adjustments.'],
            ]);
        }

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
            'variant_name' => [Rule::requiredIf($request->boolean('is_variant') && ! $request->boolean('is_batch')), 'array', 'min:1'],
            'variant_name.*' => ['required_with:variant_name', 'string', 'max:255'],
            'item_code' => [Rule::requiredIf($request->boolean('is_variant') && ! $request->boolean('is_batch')), 'array', 'min:1'],
            'item_code.*' => ['required_with:item_code', 'string', 'max:255'],
            'additional_price' => ['nullable', 'array'],
            'additional_price.*' => ['nullable', 'numeric', 'min:0'],
            'variant_id' => ['nullable', 'array'],
            'variant_id.*' => ['nullable', 'integer', 'exists:variants,id'],
            'product_variant_id' => ['nullable', 'array'],
            'product_variant_id.*' => ['nullable', 'integer', 'exists:product_variants,id'],
            'is_batch' => ['nullable', 'boolean'],
            'is_diffPrice' => ['nullable', 'boolean'],
            'warehouse_id' => ['nullable', 'array'],
            'warehouse_id.*' => ['required_with:warehouse_id', 'integer', 'exists:warehouses,id'],
            'diff_price' => ['nullable', 'array'],
            'diff_price.*' => ['nullable', 'numeric', 'min:0'],
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
        $data['is_batch'] = $data['is_batch'] ?? null;
        $data['is_variant'] = $data['is_batch'] ? null : ($data['is_variant'] ?? null);
        $data['is_diffPrice'] = $data['is_diffPrice'] ?? null;

        if (! $product) {
            $data['qty'] = 0;
        }

        if (in_array($data['type'], ['combo', 'digital'], true)) {
            $data['cost'] = 0;
            $data['unit_id'] = 0;
            $data['purchase_unit_id'] = 0;
            $data['sale_unit_id'] = 0;
        }

        return collect($data)->except([
            'variant_name',
            'item_code',
            'additional_price',
            'variant_id',
            'product_variant_id',
            'warehouse_id',
            'diff_price',
        ])->all();
    }

    private function enforceUnitIdLock(Product $product, array $data): void
    {
        if (! array_key_exists('unit_id', $data)) {
            return;
        }

        $currentUnitId = (int) ($product->unit_id ?? 0);
        $nextUnitId = (int) ($data['unit_id'] ?? 0);

        if ($currentUnitId === $nextUnitId || ! $product->unitIdLocked()) {
            return;
        }

        throw ValidationException::withMessages([
            'unit_id' => ['The product base unit cannot be changed after purchases, sales, or returns exist.'],
        ]);
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
            'variants.variant:id,name',
            'warehousePrices.warehouse:id,name',
            'warehouseStocks.warehouse:id,name',
            'warehouseStocks.batch:id,batch_no,expired_date',
            'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
        ];
    }

    private function syncVariants(Product $product, Request $request): void
    {
        if ($request->boolean('is_batch') || ! $request->boolean('is_variant')) {
            $product->variants()->delete();

            return;
        }

        $variantNames = $request->input('variant_name', []);
        $itemCodes = $request->input('item_code', []);
        $additionalPrices = $request->input('additional_price', []);
        $variantIds = $request->input('variant_id', []);
        $productVariantIds = $request->input('product_variant_id', []);
        $keptProductVariantIds = [];

        foreach ($variantNames as $index => $name) {
            $name = trim((string) $name);
            $itemCode = trim((string) ($itemCodes[$index] ?? ''));

            if ($name === '' || $itemCode === '') {
                continue;
            }

            $variant = ! empty($variantIds[$index])
                ? Variant::find($variantIds[$index])
                : Variant::firstOrCreate(['name' => $name]);

            $variant->update(['name' => $name]);

            $productVariant = ! empty($productVariantIds[$index])
                ? ProductVariant::where('product_id', $product->id)->find($productVariantIds[$index])
                : null;

            if (! $productVariant) {
                $productVariant = new ProductVariant([
                    'product_id' => $product->id,
                    'qty' => 0,
                ]);
            }

            $productVariant->fill([
                'variant_id' => $variant->id,
                'position' => $index + 1,
                'item_code' => $itemCode,
                'additional_price' => $additionalPrices[$index] ?? 0,
            ])->save();

            $keptProductVariantIds[] = $productVariant->id;
        }

        $product->variants()
            ->when($keptProductVariantIds, fn ($query) => $query->whereNotIn('id', $keptProductVariantIds))
            ->delete();
    }

    private function syncWarehousePrices(Product $product, Request $request): void
    {
        if (! $request->boolean('is_diffPrice')) {
            $product->warehousePrices()->update(['price' => null]);

            return;
        }

        $warehouseIds = $request->input('warehouse_id', []);
        $diffPrices = $request->input('diff_price', []);

        foreach ($warehouseIds as $index => $warehouseId) {
            $price = $diffPrices[$index] ?? null;
            $price = $price === '' ? null : $price;

            $warehousePrice = ProductWarehouse::firstOrNew([
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'variant_id' => null,
                'product_batch_id' => null,
            ]);

            if (! $warehousePrice->exists) {
                $warehousePrice->qty = 0;
            }

            $warehousePrice->price = $price;
            $warehousePrice->save();
        }
    }

    private function deleteStoredImage(?string $image): void
    {
        if (! $image) {
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
