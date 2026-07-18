<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransferRequest;
use App\Http\Resources\TransferResource;
use App\Models\Product;
use App\Models\ProductTransfer;
use App\Models\Transfer;
use App\Models\Unit;
use App\Services\ProductStockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class TransferController extends Controller
{
    private const SOURCE_TYPE = 'stock_transfer';

    private const RELATIONS = [
        'fromWarehouse:id,name',
        'toWarehouse:id,name',
        'user:id,name,email',
        'requestedBy:id,name,email',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,is_batch,is_variant',
        'products.product.variants.variant:id,name',
        'products.product.warehouseStocks.warehouse:id,name',
        'products.product.warehouseStocks.batch:id,batch_no,expired_date',
        'products.unit:id,unit_code,unit_name,operator,operation_value',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
        $search = trim((string) $request->query('search', ''));
        $status = $this->statusValue($request->query('status'));

        $transfers = Transfer::query()
            ->with([
                'fromWarehouse:id,name',
                'toWarehouse:id,name',
                'user:id,name,email',
                'requestedBy:id,name,email',
                'products.unit:id,unit_code,unit_name',
            ])
            ->when($status, fn ($query) => $query->where('status', $status))
            ->when($request->filled('from_warehouse_id'), fn ($query) => $query->where('from_warehouse_id', $request->integer('from_warehouse_id')))
            ->when($request->filled('to_warehouse_id'), fn ($query) => $query->where('to_warehouse_id', $request->integer('to_warehouse_id')))
            ->when($search !== '', function ($query) use ($search) {
                $like = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
                $query->where(function ($searchQuery) use ($search, $like) {
                    $searchQuery->where('reference_no', $like, "%{$search}%")
                        ->orWhere('note', $like, "%{$search}%")
                        ->orWhereHas('fromWarehouse', fn ($warehouse) => $warehouse->where('name', $like, "%{$search}%"))
                        ->orWhereHas('toWarehouse', fn ($warehouse) => $warehouse->where('name', $like, "%{$search}%"));
                });
            })
            ->latest('id')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json(TransferResource::collection($transfers)->response()->getData(true));
    }

    public function show(Transfer $transfer): JsonResponse
    {
        return response()->json([
            'data' => new TransferResource($transfer->load([
                ...self::RELATIONS,
                'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
            ])),
        ]);
    }

    public function store(StoreTransferRequest $request, ProductStockService $stockService): JsonResponse
    {
        try {
            $transfer = DB::transaction(function () use ($request, $stockService) {
                $data = $request->validated();
                $totals = $this->calculateTotals($data);
                $documentPath = $request->file('document')?->store('transfer/documents', 'public');

                $transfer = Transfer::create([
                    'reference_no' => $data['reference_no'],
                    'transfer_date' => $data['transfer_date'] ?? now()->toDateString(),
                    'user_id' => $request->user()->id,
                    'status' => (int) $data['status'],
                    'from_warehouse_id' => $data['from_warehouse_id'],
                    'to_warehouse_id' => $data['to_warehouse_id'],
                    'expected_delivery_date' => $data['expected_delivery_date'] ?? null,
                    'requested_by' => $data['requested_by'] ?? $request->user()->id,
                    'item' => $totals['item'],
                    'total_qty' => $totals['total_qty'],
                    'total_tax' => $totals['total_tax'],
                    'total_cost' => $totals['total_cost'],
                    'shipping_cost' => 0,
                    'grand_total' => $totals['grand_total'],
                    'document' => $documentPath,
                    'vehicle_courier' => $data['vehicle_courier'] ?? null,
                    'driver_contact' => $data['driver_contact'] ?? null,
                    'note' => $data['note'] ?? null,
                ]);

                $this->syncLines($transfer, $data, $stockService, $request->user()->id);

                return $transfer->load(self::RELATIONS);
            });

            return response()->json([
                'message' => 'Stock transfer created successfully.',
                'data' => new TransferResource($transfer),
            ], 201);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to create stock transfer.', [
                'user_id' => $request->user()?->id,
                'reference_no' => $request->input('reference_no'),
                'exception' => $exception,
            ]);

            return response()->json(['message' => 'Unable to create stock transfer.'], 500);
        }
    }

    public function update(StoreTransferRequest $request, Transfer $transfer, ProductStockService $stockService): JsonResponse
    {
        try {
            $transfer = DB::transaction(function () use ($request, $transfer, $stockService) {
                $data = $request->validated();
                $totals = $this->calculateTotals($data);
                $documentPath = $transfer->document;
                $oldLineIds = $transfer->products()->pluck('id')->all();

                $stockService->reverseSourceMovements(self::SOURCE_TYPE, $oldLineIds);
                ProductTransfer::query()->where('transfer_id', $transfer->id)->delete();

                if ($request->hasFile('document')) {
                    if ($documentPath) {
                        Storage::disk('public')->delete($documentPath);
                    }
                    $documentPath = $request->file('document')?->store('transfer/documents', 'public');
                }

                $transfer->update([
                    'reference_no' => $data['reference_no'],
                    'transfer_date' => $data['transfer_date'] ?? $transfer->transfer_date ?? now()->toDateString(),
                    'user_id' => $request->user()->id,
                    'status' => (int) $data['status'],
                    'from_warehouse_id' => $data['from_warehouse_id'],
                    'to_warehouse_id' => $data['to_warehouse_id'],
                    'expected_delivery_date' => $data['expected_delivery_date'] ?? null,
                    'requested_by' => $data['requested_by'] ?? $request->user()->id,
                    'item' => $totals['item'],
                    'total_qty' => $totals['total_qty'],
                    'total_tax' => $totals['total_tax'],
                    'total_cost' => $totals['total_cost'],
                    'shipping_cost' => 0,
                    'grand_total' => $totals['grand_total'],
                    'document' => $documentPath,
                    'vehicle_courier' => $data['vehicle_courier'] ?? null,
                    'driver_contact' => $data['driver_contact'] ?? null,
                    'note' => $data['note'] ?? null,
                ]);

                $this->syncLines($transfer, $data, $stockService, $request->user()->id);

                return $transfer->load(self::RELATIONS);
            });

            return response()->json([
                'message' => 'Stock transfer updated successfully.',
                'data' => new TransferResource($transfer),
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to update stock transfer.', [
                'user_id' => $request->user()?->id,
                'transfer_id' => $transfer->id,
                'exception' => $exception,
            ]);

            return response()->json(['message' => 'Unable to update stock transfer.'], 500);
        }
    }

    public function destroy(Transfer $transfer, ProductStockService $stockService): JsonResponse
    {
        DB::transaction(function () use ($transfer, $stockService) {
            $lineIds = $transfer->products()->pluck('id')->all();
            $stockService->reverseSourceMovements(self::SOURCE_TYPE, $lineIds);
            ProductTransfer::query()->where('transfer_id', $transfer->id)->delete();

            if ($transfer->document) {
                Storage::disk('public')->delete($transfer->document);
            }

            $transfer->delete();
        });

        return response()->json(['message' => 'Stock transfer deleted successfully.']);
    }

    private function syncLines(Transfer $transfer, array $data, ProductStockService $stockService, int $userId): void
    {
        foreach ($data['product_id'] as $index => $productId) {
            $product = Product::query()->lockForUpdate()->findOrFail($productId);
            $unit = Unit::query()->findOrFail($data['purchase_unit'][$index]);
            $qty = (float) $data['qty'][$index];
            $cost = (float) ($data['net_unit_cost'][$index] ?? $product->cost ?? 0);
            $taxRate = (float) ($data['tax_rate'][$index] ?? 0);
            $tax = (float) ($data['tax'][$index] ?? 0);
            $total = (float) ($data['subtotal'][$index] ?? (($qty * $cost) + $tax));

            $line = ProductTransfer::create([
                'transfer_id' => $transfer->id,
                'product_id' => $product->id,
                'product_batch_id' => $data['product_batch_id'][$index] ?? null,
                'variant_id' => $data['variant_id'][$index] ?? null,
                'qty' => $qty,
                'purchase_unit_id' => $unit->id,
                'net_unit_cost' => $cost,
                'tax_rate' => $taxRate,
                'tax' => $tax,
                'total' => $total,
                'note' => $data['line_note'][$index] ?? null,
            ]);

            if ((int) $transfer->status === Transfer::STATUS_COMPLETED) {
                $this->moveStock($transfer, $line, $product, $unit, $stockService, $userId);
            }
        }
    }

    private function moveStock(Transfer $transfer, ProductTransfer $line, Product $product, Unit $unit, ProductStockService $stockService, int $userId): void
    {
        $baseQty = $stockService->convertToBase((float) $line->qty, $unit);
        $batchId = $line->product_batch_id ? (int) $line->product_batch_id : null;
        $variantId = $line->variant_id ? (int) $line->variant_id : null;

        $stockService->applyDelta($product, (int) $transfer->from_warehouse_id, $variantId, $batchId, -1 * $baseQty);
        $stockService->recordMovement([
            'product_id' => $product->id,
            'warehouse_id' => $transfer->from_warehouse_id,
            'product_batch_id' => $batchId,
            'variant_id' => $variantId,
            'unit_id' => $unit->id,
            'user_id' => $userId,
            'source_type' => self::SOURCE_TYPE,
            'source_id' => $line->id,
            'type' => 'transfer_out',
            'quantity' => -1 * (float) $line->qty,
            'quantity_base' => -1 * $baseQty,
            'reference_no' => $transfer->reference_no,
            'note' => $line->note,
            'movement_date' => $transfer->transfer_date?->toDateString() ?? now()->toDateString(),
        ]);

        $product->refresh();
        $stockService->applyDelta($product, (int) $transfer->to_warehouse_id, $variantId, $batchId, $baseQty);
        $stockService->recordMovement([
            'product_id' => $product->id,
            'warehouse_id' => $transfer->to_warehouse_id,
            'product_batch_id' => $batchId,
            'variant_id' => $variantId,
            'unit_id' => $unit->id,
            'user_id' => $userId,
            'source_type' => self::SOURCE_TYPE,
            'source_id' => $line->id,
            'type' => 'transfer_in',
            'quantity' => (float) $line->qty,
            'quantity_base' => $baseQty,
            'reference_no' => $transfer->reference_no,
            'note' => $line->note,
            'movement_date' => $transfer->transfer_date?->toDateString() ?? now()->toDateString(),
        ]);
    }

    private function calculateTotals(array $data): array
    {
        $totalQty = 0.0;
        $totalTax = 0.0;
        $totalCost = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $cost = (float) ($data['net_unit_cost'][$index] ?? 0);
            $tax = (float) ($data['tax'][$index] ?? 0);
            $lineTotal = (float) ($data['subtotal'][$index] ?? (($qty * $cost) + $tax));

            $totalQty += $qty;
            $totalTax += $tax;
            $totalCost += $lineTotal;
        }

        return [
            'item' => count($data['product_id']),
            'total_qty' => round($totalQty, 2),
            'total_tax' => round($totalTax, 2),
            'total_cost' => round($totalCost, 2),
            'grand_total' => round($totalCost, 2),
        ];
    }

    private function statusValue(mixed $status): ?int
    {
        return match ((string) $status) {
            '1', 'pending' => Transfer::STATUS_PENDING,
            '2', 'completed' => Transfer::STATUS_COMPLETED,
            default => null,
        };
    }
}
