<?php

namespace App\Http\Controllers\Api;

use App\Actions\Sales\StoreSalesInvoiceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleRequest;
use App\Http\Resources\SaleResource;
use App\Models\Account;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductSale;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\Unit;
use App\Services\ApprovalService;
use App\Services\InvoiceLineActivityService;
use App\Services\PaymentService;
use App\Services\RecordNotificationService;
use App\Services\SalesInvoicePdfRenderer;
use App\Services\SalesInvoiceRevisionService;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class SalesInvoiceController extends Controller
{
    private const RELATIONS = [
        'customer:id,name,email,phone_number,address,city,state,postal_code,country',
        'warehouse:id,name',
        'biller:id,name,company_name,email,phone_number,address,city,state,postal_code,country,image',
        'user:id,name,email',
        'approver:id,name,email',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch,is_variant',
        'products.product.variants.variant:id,name',
        'products.unit:id,unit_code,unit_name',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
        'payments:id,sale_id,customer_id,account_id,payment_reference,payment_type,direction,amount,discount_amount,change,paying_method,payment_note',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = $request->query('per_page', 15);
        $search = trim((string) $request->query('search', ''));
        $approvalStatus = $request->query('approval_status');
        $billerId = $request->user()?->requireCurrentBillerId();
        $canFilterApproval = Schema::hasColumn('sales', 'approval_status');

        $sales = Sale::query()
            ->with(['customer:id,name', 'warehouse:id,name', 'biller:id,name'])
            ->when($billerId, fn ($query) => $query->where('biller_id', $billerId))
            ->when($canFilterApproval && ($request->boolean('approved_only') || $request->boolean('outstanding_only')), fn ($query) => $query->where('approval_status', ApprovalService::APPROVED))
            ->when($canFilterApproval && in_array($approvalStatus, [ApprovalService::PENDING, ApprovalService::APPROVED], true), fn ($query) => $query->where('approval_status', $approvalStatus))
            ->when($request->filled('customer_id'), fn ($query) => $query->where('customer_id', $request->integer('customer_id')))
            ->when($request->boolean('outstanding_only'), fn ($query) => $query->whereRaw('grand_total > COALESCE(paid_amount, 0)'))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($searchQuery) use ($search) {
                    $searchQuery->where('reference_no', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"));
                });
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json(SaleResource::collection($sales)->response()->getData(true));
    }

    public function show(Sale $sale, Request $request): JsonResponse
    {
        $this->authorizeBranch($sale, $request);

        return response()->json([
            'data' => new SaleResource($sale->load([
                ...self::RELATIONS,
                'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
            ])),
        ]);
    }

    public function store(StoreSaleRequest $request, StoreSalesInvoiceAction $storeSalesInvoice, RecordNotificationService $notifications): JsonResponse
    {
        try {
            $sale = $storeSalesInvoice->execute(
                $request->validated(),
                $request->user(),
                $request->file('document')
            );
            $notifications->salesInvoiceCreatedForCustomer($sale);

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

    public function update(StoreSaleRequest $request, Sale $sale, PaymentService $payments, ApprovalService $approvals, SalesInvoiceRevisionService $revisions): JsonResponse
    {
        $this->authorizeBranch($sale, $request);

        try {
            $sale = DB::transaction(function () use ($request, $sale, $payments, $revisions) {
                $revisions->beginUpdate($sale);
                app(ApprovalService::class)->resetSaleApproval($sale);
                $data = $request->validated();
                $billerId = $request->user()->requireCurrentBillerId();
                $totals = $this->calculateTotals($data);
                $documentPath = $sale->document;
                $lineActivities = app(InvoiceLineActivityService::class);
                $oldSaleLines = $lineActivities->salesInvoiceSnapshot($sale->id);

                if ($request->hasFile('document')) {
                    if ($documentPath) {
                        Storage::disk('public')->delete($documentPath);
                    }
                    $documentPath = $request->file('document')?->store('sale/documents', 'public');
                }

                $sale->update([
                    'reference_no' => $data['reference_no'],
                    'sale_date' => $data['sale_date'] ?? $sale->sale_date ?? now()->toDateString(),
                    'customer_id' => $data['customer_id'],
                    'warehouse_id' => $data['warehouse_id'],
                    'biller_id' => $billerId,
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
                    'payment_status' => 2,
                    'paid_amount' => 0,
                    'document' => $documentPath,
                    'sale_note' => $data['sale_note'] ?? null,
                    'staff_note' => $data['staff_note'] ?? null,
                    'approval_status' => ApprovalService::PENDING,
                    'approved_by' => null,
                    'approved_at' => null,
                ]);

                ProductSale::query()->where('sale_id', $sale->id)->delete();
                Payment::query()->where('sale_id', $sale->id)->delete();

                foreach ($data['product_id'] as $index => $productId) {
                    $product = Product::query()->findOrFail($productId);
                    $unit = $this->resolveSaleUnit($data['sale_unit'][$index] ?? null, $product);
                    $qty = (float) $data['qty'][$index];
                    $baseQuantity = $this->baseQuantity($qty, $unit);
                    $cost = $this->costSnapshot($product, $qty, $baseQuantity);

                    ProductSale::create([
                        'sale_id' => $sale->id,
                        'date' => $sale->sale_date?->toDateString(),
                        'product_id' => $productId,
                        'variant_id' => $this->resolveVariantId($product, $data, $index),
                        'product_batch_id' => $data['product_batch_id'][$index] ?? null,
                        'qty' => $qty,
                        'sale_unit_id' => $unit?->id ?? 0,
                        'net_unit_price' => (float) $data['net_unit_price'][$index],
                        'discount' => (float) $data['discount'][$index],
                        'tax_rate' => (float) ($data['tax_rate'][$index] ?? 0),
                        'tax' => (float) $data['tax'][$index],
                        'total' => $totals['lines'][$index],
                        'unit_cost' => $cost['unit_cost'],
                        'total_cost' => $cost['total_cost'],
                    ]);
                }

                $lineActivities->logChanges(
                    $sale,
                    'sales_invoice',
                    'Sales invoice product lines updated',
                    $oldSaleLines,
                    $lineActivities->salesInvoiceSnapshot($sale->id),
                    $request->user()
                );
                $this->createPaymentIfNeeded($sale, $data, $request->user(), $payments);
                $revisions->syncPending($sale);

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

    public function approve(Sale $sale, Request $request, ApprovalService $approvals, RecordNotificationService $notifications): JsonResponse
    {
        $this->authorizeBranch($sale, $request);

        $sale = $approvals->approveSale($sale, $request->user());
        $notifications->salesInvoiceApproved($sale);
        $notifications->salesInvoiceApprovedForCustomer($sale);

        return response()->json([
            'message' => 'Sales invoice approved successfully.',
            'data' => new SaleResource($sale),
        ]);
    }

    public function updateLineCost(Sale $sale, ProductSale $productSale, Request $request): JsonResponse
    {
        $this->authorizeBranch($sale, $request);
        abort_unless((int) $productSale->sale_id === (int) $sale->id, 404);

        $data = $request->validate([
            'unit_cost' => ['required', 'numeric', 'min:0'],
        ]);

        $unitCost = round((float) $data['unit_cost'], 2);
        $previousUnitCost = round((float) $productSale->unit_cost, 2);
        $productSale->update([
            'unit_cost' => $unitCost,
            'total_cost' => round($unitCost * (float) $productSale->qty, 2),
        ]);

        if ($previousUnitCost !== $unitCost) {
            activity('sales_invoice')
                ->performedOn($sale)
                ->causedBy($request->user())
                ->event('updated')
                ->withProperties([
                    'old' => ['cost_price' => $previousUnitCost],
                    'attributes' => ['cost_price' => $unitCost],
                ])
                ->log('Sales invoice cost price updated');
        }

        return response()->json([
            'message' => 'Sale line cost updated successfully.',
            'data' => new SaleResource($sale->fresh()->load([
                ...self::RELATIONS,
                'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
            ])),
        ]);
    }

    public function pdf(
        Sale $sale,
        Request $request,
        SalesInvoiceSnapshotService $snapshots,
        SalesInvoicePdfRenderer $renderer,
    ): Response {
        $this->authorizeBranch($sale, $request);
        abort_unless($sale->approval_status === ApprovalService::APPROVED, 403, 'Sales invoice must be approved before printing.');

        $snapshot = $snapshots->snapshot($sale);
        $bytes = $renderer->render($snapshot);

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$renderer->filename($snapshot).'"',
        ]);
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

    private function authorizeBranch(Sale $sale, Request $request): void
    {
        abort_unless((int) $sale->biller_id === $request->user()->requireCurrentBillerId(), 404);
    }

    private function resolveVariantId(Product $product, array $data, int|string $index): ?int
    {
        if (! $product->is_variant || (empty($data['variant_id'][$index]) && empty($data['product_code'][$index]))) {
            return null;
        }

        return ProductVariant::query()
            ->where('product_id', $product->id)
            ->when(
                ! empty($data['variant_id'][$index]),
                fn ($query) => $query->where('variant_id', $data['variant_id'][$index]),
                fn ($query) => $query->where('item_code', $data['product_code'][$index])
            )
            ->value('variant_id');
    }

    private function createPaymentIfNeeded(Sale $sale, array $data, $user, PaymentService $payments): void
    {
        $paidAmount = (float) ($data['paid_amount'] ?? 0);

        if ($paidAmount <= 0) {
            $payments->recalculateSale($sale->id);

            return;
        }

        $account = ! empty($data['account_id'])
            ? Account::query()->whereKey($data['account_id'])->first()
            : Account::query()->where('is_default', true)->first();

        if (! $account) {
            throw ValidationException::withMessages([
                'paid_amount' => ['A default account is required before recording sale payments.'],
            ]);
        }

        $payments->record([
            'sale_id' => $sale->id,
            'cash_register_id' => $sale->cash_register_id,
            'account_id' => $account->id,
            'customer_id' => $sale->customer_id,
            'payment_reference' => 'spr-'.date('Ymd').'-'.date('His'),
            'payment_type' => Payment::TYPE_SALE_PAYMENT,
            'direction' => Payment::DIRECTION_IN,
            'amount' => $paidAmount,
            'discount_amount' => (float) ($data['payment_discount_amount'] ?? 0),
            'change' => (float) ($data['paying_amount'] ?? $paidAmount) - $paidAmount,
            'paying_method' => $this->paymentMethod((int) ($data['paid_by_id'] ?? 1)),
            'payment_note' => $data['payment_note'] ?? null,
        ], $user);
    }

    private function paymentMethod(int $paidById): string
    {
        return match ($paidById) {
            1 => 'Cash',
            2 => 'Gift Card',
            3 => 'Credit Card',
            4 => 'Cheque',
            5 => 'Paypal',
            default => 'Deposit',
        };
    }

    private function resolveSaleUnit(mixed $saleUnit, Product $product): ?Unit
    {
        if ($saleUnit === null || $saleUnit === '') {
            return $product->sale_unit_id ? Unit::find($product->sale_unit_id) : null;
        }

        if ((string) $saleUnit === 'n/a') {
            return null;
        }

        if (is_numeric($saleUnit)) {
            return Unit::find((int) $saleUnit);
        }

        return Unit::query()->where('unit_name', $saleUnit)->first();
    }

    private function baseQuantity(float $qty, ?Unit $unit): float
    {
        if (! $unit) {
            return $qty;
        }

        if ($unit->operator === '*') {
            return $qty * (float) $unit->operation_value;
        }

        if ($unit->operator === '/' && (float) $unit->operation_value !== 0.0) {
            return $qty / (float) $unit->operation_value;
        }

        return $qty;
    }

    private function costSnapshot(Product $product, float $qty, float $baseQuantity): array
    {
        $totalCost = round((float) $product->cost * $baseQuantity, 2);

        return [
            'unit_cost' => $qty > 0 ? round($totalCost / $qty, 2) : 0,
            'total_cost' => $totalCost,
        ];
    }
}
