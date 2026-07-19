<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StockAdjustmentRequest;
use App\Http\Resources\ProductStockResource;
use App\Http\Resources\StockMovementResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ProductStockService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
        $warehouseId = $request->integer('warehouse_id') ?: null;
        $categoryId = $request->integer('category_id') ?: null;

        $products = Product::query()
            ->with([
                'category:id,name',
                'unit:id,unit_code,unit_name,base_unit,operator,operation_value',
                'variants.variant:id,name',
                'warehouseStocks' => fn ($query) => $query
                    ->when($warehouseId, fn ($stockQuery) => $stockQuery->where('warehouse_id', $warehouseId))
                    ->with(['warehouse:id,name', 'batch:id,batch_no,expired_date']),
            ])
            ->when($warehouseId, function ($query) use ($warehouseId) {
                $query->whereHas('warehouseStocks', fn ($stockQuery) => $stockQuery->where('warehouse_id', $warehouseId))
                    ->withSum([
                        'warehouseStocks as selected_warehouse_stock' => fn ($stockQuery) => $stockQuery->where('warehouse_id', $warehouseId),
                    ], 'qty');
            })
            ->when($categoryId, fn ($query) => $query->where('category_id', $categoryId))
            ->where('is_active', true)
            ->where('type', '!=', 'digital')
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = trim((string) $request->string('search'));
                $like = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

                $query->where(function ($subQuery) use ($term, $like) {
                    $subQuery->where('name', $like, "%{$term}%")
                        ->orWhere('code', $like, "%{$term}%")
                        ->orWhereHas('warehouseStocks.warehouse', fn ($warehouseQuery) => $warehouseQuery->where('name', $like, "%{$term}%"));
                });
            })
            ->orderBy('name')
            ->paginate($perPage)
            ->withQueryString();

        return ProductStockResource::collection($products);
    }

    public function history(Request $request, Product $product)
    {
        abort_if($product->type === 'digital', 404);

        if ($request->query('export') === 'csv') {
            return $this->historyCsv($product, $request);
        }

        $perPage = min(max((int) $request->integer('per_page', 10), 1), 100);

        return StockMovementResource::collection(
            $this->historyQuery($product, $request)
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function storeAdjustment(StockAdjustmentRequest $request, Product $product, ProductStockService $stockService)
    {
        $movement = $stockService->createAdjustment($product, $request->validated(), $request->user());

        return response()->json([
            'message' => 'Stock adjustment created successfully.',
            'data' => new StockMovementResource($movement->load($this->movementRelations())),
        ], 201);
    }

    public function updateAdjustment(StockAdjustmentRequest $request, StockMovement $movement, ProductStockService $stockService)
    {
        $movement = $stockService->updateAdjustment($movement, $request->validated(), $request->user());

        return response()->json([
            'message' => 'Stock adjustment updated successfully.',
            'data' => new StockMovementResource($movement->load($this->movementRelations())),
        ]);
    }

    public function destroyAdjustment(StockMovement $movement, ProductStockService $stockService)
    {
        $stockService->deleteAdjustment($movement);

        return response()->json([
            'message' => 'Stock adjustment deleted successfully.',
        ]);
    }

    private function historyQuery(Product $product, Request $request)
    {
        return StockMovement::query()
            ->with($this->movementRelations())
            ->where('product_id', $product->id)
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = trim((string) $request->string('search'));
                $like = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

                $query->where(function ($subQuery) use ($term, $like) {
                    $subQuery->where('type', $like, "%{$term}%")
                        ->orWhere('reference_no', $like, "%{$term}%")
                        ->orWhere('note', $like, "%{$term}%")
                        ->orWhereHas('warehouse', fn ($warehouseQuery) => $warehouseQuery->where('name', $like, "%{$term}%"))
                        ->orWhereHas('variant', fn ($variantQuery) => $variantQuery->where('name', $like, "%{$term}%"))
                        ->orWhereHas('batch', fn ($batchQuery) => $batchQuery->where('batch_no', $like, "%{$term}%"));
                });
            })
            ->when($request->filled('from'), fn ($query) => $query->whereDate('movement_date', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($query) => $query->whereDate('movement_date', '<=', $request->date('to')))
            ->latest('movement_date')
            ->latest('id');
    }

    private function historyCsv(Product $product, Request $request): StreamedResponse
    {
        $filename = 'stock-history-'.$product->id.'.csv';

        return response()->streamDownload(function () use ($product, $request) {
            $output = fopen('php://output', 'w');
            fputcsv($output, ['Date', 'Type', 'Qty', 'Before', 'After', 'Reference', 'Variant', 'Unit', 'Warehouse', 'Batch', 'Note']);

            $this->historyQuery($product, $request)
                ->chunk(200, function ($movements) use ($output) {
                    foreach ($movements as $movement) {
                        fputcsv($output, [
                            $movement->movement_date?->toDateString() ?? $movement->created_at?->toDateString(),
                            $movement->type,
                            $movement->quantity,
                            $movement->before_quantity,
                            $movement->after_quantity,
                            $movement->reference_no,
                            $movement->variant?->name,
                            $movement->unit?->unit_name,
                            $movement->warehouse?->name,
                            $movement->batch?->batch_no,
                            $movement->note,
                        ]);
                    }
                });

            fclose($output);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }

    private function movementRelations(): array
    {
        return [
            'product:id,name,code,type,is_variant,is_batch',
            'warehouse:id,name',
            'batch:id,batch_no,expired_date',
            'variant:id,name',
            'unit:id,unit_code,unit_name',
            'user:id,name,email',
        ];
    }
}
