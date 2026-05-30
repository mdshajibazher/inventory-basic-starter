<?php

namespace App\Http\Controllers\Api;

use App\Actions\Sales\StoreSalesInvoiceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleRequest;
use App\Http\Resources\SaleResource;
use App\Models\Payment;
use App\Models\ProductSale;
use App\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class SalesInvoiceController extends Controller
{
    private const RELATIONS = [
        'customer:id,name,email,phone_number',
        'warehouse:id,name',
        'biller:id,name,company_name',
        'user:id,name,email',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch',
        'products.unit:id,unit_code,unit_name',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
        'payments:id,sale_id,payment_reference,amount,change,paying_method,payment_note',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $search = trim((string) $request->query('search', ''));

        $sales = Sale::query()
            ->with(['customer:id,name', 'warehouse:id,name', 'biller:id,name'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where('reference_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"));
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json(SaleResource::collection($sales)->response()->getData(true));
    }

    public function show(Sale $sale): JsonResponse
    {
        return response()->json([
            'data' => new SaleResource($sale->load(self::RELATIONS)),
        ]);
    }

    public function store(StoreSaleRequest $request, StoreSalesInvoiceAction $storeSalesInvoice): JsonResponse
    {
        try {
            $sale = $storeSalesInvoice->execute(
                $request->validated(),
                $request->user(),
                $request->file('document')
            );

            return response()->json([
                'message' => 'Sales invoice created successfully.',
                'data' => new SaleResource($sale),
            ], 201);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to create sales invoice.', [
                'user_id' => $request->user()?->id,
                'reference_no' => $request->input('reference_no'),
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to create sales invoice.',
            ], 500);
        }
    }

    public function update(StoreSaleRequest $request, Sale $sale): JsonResponse
    {
        try {
            $sale = DB::transaction(function () use ($request, $sale) {
                $data = $request->validated();
                $totals = $this->calculateTotals($data);
                $documentPath = $sale->document;

                if ($request->hasFile('document')) {
                    if ($documentPath) {
                        Storage::disk('public')->delete($documentPath);
                    }
                    $documentPath = $request->file('document')?->store('sale/documents', 'public');
                }

                $sale->update([
                    'reference_no' => $data['reference_no'],
                    'customer_id' => $data['customer_id'],
                    'warehouse_id' => $data['warehouse_id'],
                    'biller_id' => $data['biller_id'],
                    'item' => $totals['item'],
                    'total_qty' => $totals['total_qty'],
                    'total_discount' => $totals['total_discount'],
                    'total_tax' => $totals['total_tax'],
                    'total_price' => $totals['total_price'],
                    'order_tax_rate' => $totals['order_tax_rate'],
                    'order_tax' => $totals['order_tax'],
                    'order_discount' => $totals['order_discount'],
                    'coupon_id' => $data['coupon_id'] ?? null,
                    'coupon_discount' => $totals['coupon_discount'],
                    'shipping_cost' => $totals['shipping_cost'],
                    'grand_total' => $totals['grand_total'],
                    'sale_status' => $data['sale_status'],
                    'payment_status' => $data['payment_status'],
                    'paid_amount' => (float) ($data['paid_amount'] ?? 0),
                    'document' => $documentPath,
                    'sale_note' => $data['sale_note'] ?? null,
                    'staff_note' => $data['staff_note'] ?? null,
                ]);

                ProductSale::query()->where('sale_id', $sale->id)->delete();
                Payment::query()->where('sale_id', $sale->id)->delete();

                foreach ($data['product_id'] as $index => $productId) {
                    ProductSale::create([
                        'sale_id' => $sale->id,
                        'product_id' => $productId,
                        'product_batch_id' => $data['product_batch_id'][$index] ?? null,
                        'qty' => (float) $data['qty'][$index],
                        'sale_unit_id' => (int) ($data['sale_unit'][$index] ?? 0),
                        'net_unit_price' => (float) $data['net_unit_price'][$index],
                        'discount' => (float) $data['discount'][$index],
                        'tax_rate' => (float) ($data['tax_rate'][$index] ?? 0),
                        'tax' => (float) $data['tax'][$index],
                        'total' => $totals['lines'][$index],
                    ]);
                }

                return $sale->load(self::RELATIONS);
            });

            return response()->json([
                'message' => 'Sales invoice updated successfully.',
                'data' => new SaleResource($sale),
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to update sales invoice.', [
                'user_id' => $request->user()?->id,
                'sale_id' => $sale->id,
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to update sales invoice.',
            ], 500);
        }
    }

    private function calculateTotals(array $data): array
    {
        $lines = [];
        $totalQty = $totalDiscount = $totalTax = $totalPrice = 0.0;

        foreach ($data['product_id'] as $index => $productId) {
            $qty = (float) $data['qty'][$index];
            $discount = (float) $data['discount'][$index];
            $tax = (float) $data['tax'][$index];
            $lineTotal = round(((float) $data['net_unit_price'][$index] * $qty) - $discount + $tax, 2);
            $lines[$index] = $lineTotal;
            $totalQty += $qty;
            $totalDiscount += $discount;
            $totalTax += $tax;
            $totalPrice += $lineTotal;
        }

        $orderTaxRate = (float) ($data['order_tax_rate'] ?? 0);
        $orderTax = round($totalPrice * $orderTaxRate / 100, 2);
        $orderDiscount = (float) ($data['order_discount'] ?? 0);
        $couponDiscount = (float) ($data['coupon_discount'] ?? 0);
        $shippingCost = (float) ($data['shipping_cost'] ?? 0);

        return [
            'lines' => $lines,
            'item' => count($data['product_id']),
            'total_qty' => round($totalQty, 2),
            'total_discount' => round($totalDiscount, 2),
            'total_tax' => round($totalTax, 2),
            'total_price' => round($totalPrice, 2),
            'order_tax_rate' => round($orderTaxRate, 2),
            'order_tax' => $orderTax,
            'order_discount' => round($orderDiscount, 2),
            'coupon_discount' => round($couponDiscount, 2),
            'shipping_cost' => round($shippingCost, 2),
            'grand_total' => round($totalPrice + $orderTax + $shippingCost - $orderDiscount - $couponDiscount, 2),
        ];
    }
}
