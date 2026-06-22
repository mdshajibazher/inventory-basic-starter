<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Account;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function index(Request $request, PaymentService $payments)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return PaymentResource::collection(
            $this->baseQuery($payments)
                ->when($request->filled('customer_id'), fn ($query) => $query->where('customer_id', $request->integer('customer_id')))
                ->when($request->filled('supplier_id'), fn ($query) => $query->where('supplier_id', $request->integer('supplier_id')))
                ->when($request->filled('account_id'), fn ($query) => $query->where('account_id', $request->integer('account_id')))
                ->when($request->filled('payment_type'), fn ($query) => $query->where('payment_type', (string) $request->string('payment_type')))
                ->when($request->filled('direction'), fn ($query) => $query->where('direction', (string) $request->string('direction')))
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function store(StorePaymentRequest $request, PaymentService $payments): JsonResponse
    {
        $payment = $payments->record($request->validated(), $request->user());

        return response()->json([
            'message' => 'Payment recorded successfully.',
            'data' => new PaymentResource($payment),
        ], 201);
    }

    public function show(Payment $payment, PaymentService $payments): JsonResponse
    {
        return response()->json([
            'data' => new PaymentResource($payment->load($payments->relations())),
        ]);
    }

    public function customerStatement(Request $request, Customer $customer, PaymentService $payments)
    {
        return $this->statement(
            $request,
            $this->baseQuery($payments)->where('customer_id', $customer->id)
        );
    }

    public function supplierStatement(Request $request, Supplier $supplier, PaymentService $payments)
    {
        return $this->statement(
            $request,
            $this->baseQuery($payments)->where('supplier_id', $supplier->id)
        );
    }

    public function accountStatement(Request $request, Account $account, PaymentService $payments)
    {
        return $this->statement(
            $request,
            $this->baseQuery($payments)->where('account_id', $account->id)
        );
    }

    private function statement(Request $request, $query)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return PaymentResource::collection(
            $query
                ->when($request->filled('from'), fn ($statement) => $statement->whereDate('created_at', '>=', $request->date('from')))
                ->when($request->filled('to'), fn ($statement) => $statement->whereDate('created_at', '<=', $request->date('to')))
                ->oldest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    private function baseQuery(PaymentService $payments)
    {
        return Payment::query()->with($payments->relations());
    }
}
