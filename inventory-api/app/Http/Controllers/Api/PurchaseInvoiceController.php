<?php

namespace App\Http\Controllers\Api;

use App\Actions\Purchases\StorePurchaseInvoiceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseRequest;
use App\Http\Resources\PurchaseResource;
use App\Models\Payment;
use App\Models\ProductPurchase;
use App\Models\Purchase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class PurchaseInvoiceController extends Controller
{
    private const RELATIONS = [
        'supplier:id,name,email,phone_number',
        'warehouse:id,name',
        'user:id,name,email',
        'purchaseStatus:id,value,label',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch',
        'products.unit:id,unit_code,unit_name',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
        'payments:id,purchase_id,payment_reference,amount,change,paying_method,payment_note',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $search = trim((string) $request->query('search', ''));

        $purchases = Purchase::query()
            ->with(['supplier:id,name', 'warehouse:id,name', 'purchaseStatus:id,value,label'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where('reference_no', 'like', "%{$search}%")
                    ->orWhereHas('supplier', fn ($supplier) => $supplier->where('name', 'like', "%{$search}%"));
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json(PurchaseResource::collection($purchases)->response()->getData(true));
    }

    public function show(Purchase $purchase): JsonResponse
    {
        return response()->json([
            'data' => new PurchaseResource($purchase->load(self::RELATIONS)),
        ]);
    }

    public function store(StorePurchaseRequest $request, StorePurchaseInvoiceAction $storePurchaseInvoice): JsonResponse
    {
        try {
            $purchase = $storePurchaseInvoice->execute(
                $request->validated(),
                $request->user(),
                $request->file('document')
            );

            return response()->json([
                'message' => 'Purchase invoice created successfully.',
                'data' => new PurchaseResource($purchase),
            ], 201);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to create purchase invoice.', [
                'user_id' => $request->user()?->id,
                'reference_no' => $request->input('reference_no'),
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to create purchase invoice.',
            ], 500);
        }
    }

    public function update(StorePurchaseRequest $request, Purchase $purchase): JsonResponse
    {
        try {
            $purchase = DB::transaction(function () use ($request, $purchase) {
                $data = $request->validated();
                $totals = $this->calculateTotals($data);
                $paidAmount = min((float) ($data['paid_amount'] ?? 0), $totals['grand_total']);
                $documentPath = $purchase->document;

                if ($request->hasFile('document')) {
                    if ($documentPath) {
                        Storage::disk('public')->delete($documentPath);
                    }
                    $documentPath = $request->file('document')?->store('purchase/documents', 'public');
                }

                $purchase->update([
                    'reference_no' => $data['reference_no'],
                    'warehouse_id' => $data['warehouse_id'],
                    'supplier_id' => $data['supplier_id'],
                    'item' => $totals['item'],
                    'total_qty' => $totals['total_qty'],
                    'total_discount' => $totals['total_discount'],
                    'total_tax' => $totals['total_tax'],
                    'total_cost' => $totals['total_cost'],
                    'order_tax_rate' => $totals['order_tax_rate'],
                    'order_tax' => $totals['order_tax'],
                    'order_discount' => $totals['order_discount'],
                    'shipping_cost' => $totals['shipping_cost'],
                    'grand_total' => $totals['grand_total'],
                    'paid_amount' => $paidAmount,
                    'status' => $data['status'],
                    'payment_status' => $paidAmount > 0 && abs($totals['grand_total'] - $paidAmount) < 0.01 ? 2 : (int) $data['payment_status'],
                    'document' => $documentPath,
                    'note' => $data['note'] ?? null,
                ]);

                ProductPurchase::query()->where('purchase_id', $purchase->id)->delete();
                Payment::query()->where('purchase_id', $purchase->id)->delete();

                foreach ($data['product_id'] as $index => $productId) {
                    $qty = (float) $data['qty'][$index];
                    $received = $this->receivedQuantity((int) $data['status'], $qty, (float) $data['received'][$index]);

                    ProductPurchase::create([
                        'purchase_id' => $purchase->id,
                        'product_id' => $productId,
                        'qty' => $qty,
                        'recieved' => $received,
                        'purchase_unit_id' => (int) $data['purchase_unit'][$index],
                        'net_unit_cost' => (float) $data['net_unit_cost'][$index],
                        'discount' => (float) $data['discount'][$index],
                        'tax_rate' => (float) $data['tax_rate'][$index],
                        'tax' => (float) $data['tax'][$index],
                        'total' => $this->receivedLineTotal((int) $data['status'], $qty, $received, $totals['lines'][$index]),
                    ]);
                }

                return $purchase->load(self::RELATIONS);
            });

            return response()->json([
                'message' => 'Purchase invoice updated successfully.',
                'data' => new PurchaseResource($purchase),
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to update purchase invoice.', [
                'user_id' => $request->user()?->id,
                'purchase_id' => $purchase->id,
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to update purchase invoice.',
            ], 500);
        }
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = $totalDiscount = $totalTax = $totalCost = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = round(((float) $data['net_unit_cost'][$index] * $qty) - $discount + $tax, 2);
            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalCost += $lineTotal;
        }

        if ((int) $data['status'] === 4) {
            $totalDiscount = $totalTax = $totalCost = 0.0;
            $lines = array_fill_keys(array_keys($lines), 0.0);
        }

        $orderTaxRate = (int) $data['status'] === 4 ? 0.0 : (float) ($data['order_tax_rate'] ?? 0);
        $orderDiscount = (int) $data['status'] === 4 ? 0.0 : (float) ($data['order_discount'] ?? 0);
        $shippingCost = (int) $data['status'] === 4 ? 0.0 : (float) ($data['shipping_cost'] ?? 0);
        $orderTax = round(max($totalCost - $orderDiscount, 0) * $orderTaxRate / 100, 2);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => round($totalQty, 2),
            'total_discount' => round($totalDiscount, 2),
            'total_tax' => round($totalTax, 2),
            'total_cost' => round($totalCost, 2),
            'order_tax_rate' => round($orderTaxRate, 2),
            'order_tax' => $orderTax,
            'order_discount' => round($orderDiscount, 2),
            'shipping_cost' => round($shippingCost, 2),
            'grand_total' => round($totalCost + $orderTax + $shippingCost - $orderDiscount, 2),
        ];
    }

    private function receivedQuantity(int $status, float $qty, float $requestedReceived): float
    {
        return match ($status) {
            1 => $qty,
            3, 4 => 0.0,
            default => min(max($requestedReceived, 0), $qty),
        };
    }

    private function receivedLineTotal(int $status, float $qty, float $received, float $lineTotal): float
    {
        if (in_array($status, [3, 4], true)) return 0.0;
        if ($status === 2) return $qty > 0 ? round($lineTotal * ($received / $qty), 2) : 0.0;
        return $lineTotal;
    }
}
