<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Account;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\ApprovalService;
use App\Services\PaymentService;
use App\Services\RecordNotificationService;
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
                ->when($request->filled('payment_types'), fn ($query) => $query->whereIn('payment_type', collect(explode(',', (string) $request->string('payment_types')))->map(fn ($type) => trim($type))->filter()->values()))
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

    public function show(Payment $payment, Request $request, PaymentService $payments): JsonResponse
    {
        $this->authorizeBranch($payment, $request);

        return response()->json([
            'data' => new PaymentResource($payment->load([
                ...$payments->relations(),
                'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
            ])),
        ]);
    }

    public function update(StorePaymentRequest $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        $this->authorizeBranch($payment, $request);
        abort_unless($payments->canEditDomain($request->user(), $payment), 403);

        $payment = $payments->update($payment, $request->validated(), $request->user());

        return response()->json([
            'message' => 'Payment updated successfully.',
            'data' => new PaymentResource($payment),
        ]);
    }

    public function approve(Payment $payment, Request $request, ApprovalService $approvals, RecordNotificationService $notifications): JsonResponse
    {
        $this->authorizeBranch($payment, $request);

        $payment = $approvals->approvePayment($payment, $request->user());
        $notifications->paymentApproved($payment);

        return response()->json([
            'message' => 'Payment approved successfully.',
            'data' => new PaymentResource($payment),
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
        return Payment::query()
            ->with($payments->relations())
            ->where('biller_id', request()->user()->requireCurrentBillerId());
    }

    private function authorizeBranch(Payment $payment, Request $request): void
    {
        abort_unless((int) $payment->biller_id === $request->user()->requireCurrentBillerId(), 404);
    }
}
