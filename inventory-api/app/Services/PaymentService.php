<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Purchase;
use App\Models\ReturnInvoice;
use App\Models\ReturnPurchase;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    public function record(array $data, User $user): Payment
    {
        return DB::transaction(function () use ($data, $user) {
            $data = $this->normalize($data);
            $this->validateBusinessRules($data);
            $this->validateDocumentBranch($data, $user);
            $this->validateSaleSettlement($data);

            $payment = Payment::create([
                'user_id' => $user->id,
                'biller_id' => $user->requireCurrentBillerId(),
                'purchase_id' => $data['purchase_id'] ?? null,
                'sale_id' => $data['sale_id'] ?? null,
                'sale_return_id' => $data['sale_return_id'] ?? null,
                'purchase_return_id' => $data['purchase_return_id'] ?? null,
                'cash_register_id' => $data['cash_register_id'] ?? null,
                'account_id' => $data['account_id'],
                'customer_id' => $data['customer_id'] ?? null,
                'supplier_id' => $data['supplier_id'] ?? null,
                'payment_reference' => $data['payment_reference'] ?? $this->referenceFor($data['payment_type']),
                'payment_type' => $data['payment_type'],
                'direction' => $data['direction'],
                'amount' => round((float) $data['amount'], 2),
                'discount_amount' => round((float) ($data['discount_amount'] ?? 0), 2),
                'change' => round((float) ($data['change'] ?? 0), 2),
                'paying_method' => $data['paying_method'],
                'payment_note' => $data['payment_note'] ?? null,
                'approval_status' => ApprovalService::PENDING,
            ]);

            return $payment->load($this->relations());
        });
    }

    public function canEdit(User $user, Payment $payment): bool
    {
        return ($payment->approval_status ?? ApprovalService::APPROVED) === ApprovalService::PENDING
            && $this->canEditDomain($user, $payment);
    }

    public function canEditDomain(User $user, Payment $payment): bool
    {
        if ($user->can('accounts-edit')) {
            return true;
        }

        return $payment->customer_id
            ? $user->can('sales-edit')
            : $user->can('purchases-edit');
    }

    public function update(Payment $payment, array $data, User $user): Payment
    {
        return DB::transaction(function () use ($payment, $data, $user) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);

            if (($payment->approval_status ?? ApprovalService::APPROVED) !== ApprovalService::PENDING) {
                throw ValidationException::withMessages([
                    'payment' => ['Only pending payments can be edited.'],
                ]);
            }

            $data = $this->normalize($data);
            $wasCustomerPayment = ! empty($payment->customer_id);
            $willBeCustomerPayment = ! empty($data['customer_id']);

            if ($wasCustomerPayment !== $willBeCustomerPayment) {
                throw ValidationException::withMessages([
                    'payment_type' => ['A payment cannot be changed between customer and supplier types.'],
                ]);
            }

            $this->validateBusinessRules($data);
            $this->validateDocumentBranch($data, $user);
            $this->validateSaleSettlement($data);

            $payment->fill([
                'purchase_id' => $data['purchase_id'] ?? null,
                'sale_id' => $data['sale_id'] ?? null,
                'sale_return_id' => $data['sale_return_id'] ?? null,
                'purchase_return_id' => $data['purchase_return_id'] ?? null,
                'account_id' => $data['account_id'],
                'customer_id' => $data['customer_id'] ?? null,
                'supplier_id' => $data['supplier_id'] ?? null,
                'payment_reference' => $data['payment_reference'] ?? $payment->payment_reference,
                'payment_type' => $data['payment_type'],
                'direction' => $data['direction'],
                'amount' => round((float) $data['amount'], 2),
                'discount_amount' => round((float) ($data['discount_amount'] ?? 0), 2),
                'change' => round((float) ($data['change'] ?? 0), 2),
                'paying_method' => $data['paying_method'],
                'payment_note' => $data['payment_note'] ?? null,
            ])->save();

            return $payment->load($this->relations());
        });
    }

    public function recalculateLinkedInvoice(Payment $payment): void
    {
        if ($payment->sale_id) {
            $this->recalculateSale((int) $payment->sale_id);
        }

        if ($payment->purchase_id) {
            $this->recalculatePurchase((int) $payment->purchase_id);
        }
    }

    public function recalculateSale(int $saleId): void
    {
        $sale = Sale::query()->lockForUpdate()->find($saleId);

        if (! $sale) {
            return;
        }

        $paidAmount = (float) Payment::query()
            ->where('sale_id', $sale->id)
            ->where('payment_type', Payment::TYPE_SALE_PAYMENT)
            ->where('direction', Payment::DIRECTION_IN)
            ->where('approval_status', ApprovalService::APPROVED)
            ->selectRaw('COALESCE(SUM(amount + COALESCE(discount_amount, 0)), 0) as settled_total')
            ->value('settled_total');

        $sale->paid_amount = min(round($paidAmount, 2), (float) $sale->grand_total);
        $sale->payment_status = $this->salePaymentStatus($sale->paid_amount, (float) $sale->grand_total);
        $sale->save();
    }

    public function recalculatePurchase(int $purchaseId): void
    {
        $purchase = Purchase::query()->lockForUpdate()->find($purchaseId);

        if (! $purchase) {
            return;
        }

        $paidAmount = (float) Payment::query()
            ->where('purchase_id', $purchase->id)
            ->where('payment_type', Payment::TYPE_PURCHASE_PAYMENT)
            ->where('direction', Payment::DIRECTION_OUT)
            ->where('approval_status', ApprovalService::APPROVED)
            ->sum('amount');

        $purchase->paid_amount = min(round($paidAmount, 2), (float) $purchase->grand_total);
        $purchase->payment_status = $this->purchasePaymentStatus($purchase->paid_amount, (float) $purchase->grand_total);
        $purchase->save();
    }

    public function relations(): array
    {
        return [
            'account:id,name,account_no',
            'biller:id,name,company_name',
            'customer:id,name,email,phone_number',
            'supplier:id,name,email,phone_number',
            'sale:id,reference_no,grand_total,paid_amount',
            'purchase:id,reference_no,grand_total,paid_amount',
            'saleReturn:id,reference_no,grand_total',
            'purchaseReturn:id,reference_no,grand_total',
            'user:id,name,email',
            'approver:id,name,email',
        ];
    }

    private function normalize(array $data): array
    {
        $data['discount_amount'] = $data['discount_amount'] ?? 0;

        $defaults = match ($data['payment_type'] ?? null) {
            Payment::TYPE_SALE_PAYMENT, Payment::TYPE_CUSTOMER_ADVANCE => [
                'direction' => Payment::DIRECTION_IN,
                'supplier_id' => null,
            ],
            Payment::TYPE_PURCHASE_PAYMENT, Payment::TYPE_SUPPLIER_ADVANCE => [
                'direction' => Payment::DIRECTION_OUT,
                'customer_id' => null,
            ],
            Payment::TYPE_SALE_RETURN_REFUND => [
                'direction' => Payment::DIRECTION_OUT,
                'supplier_id' => null,
            ],
            Payment::TYPE_PURCHASE_RETURN_REFUND => [
                'direction' => Payment::DIRECTION_IN,
                'customer_id' => null,
            ],
            default => [],
        };

        foreach ($defaults as $key => $value) {
            if (! isset($data[$key])) {
                $data[$key] = $value;
            }
        }

        return $data;
    }

    private function validateBusinessRules(array $data): void
    {
        $errors = [];
        $hasCustomer = ! empty($data['customer_id']);
        $hasSupplier = ! empty($data['supplier_id']);

        if ($hasCustomer === $hasSupplier) {
            $errors['customer_id'][] = 'A payment must belong to exactly one customer or supplier.';
            $errors['supplier_id'][] = 'A payment must belong to exactly one customer or supplier.';
        }

        if ((float) ($data['amount'] ?? 0) <= 0) {
            $errors['amount'][] = 'The amount must be greater than 0.';
        }

        if ((float) ($data['discount_amount'] ?? 0) < 0) {
            $errors['discount_amount'][] = 'The discount amount must be at least 0.';
        }

        if ((float) ($data['discount_amount'] ?? 0) > 0
            && ! in_array($data['payment_type'] ?? null, [Payment::TYPE_SALE_PAYMENT, Payment::TYPE_CUSTOMER_ADVANCE], true)) {
            $errors['discount_amount'][] = 'Discounts are only available for sales invoice payments and customer advances.';
        }

        if ((float) ($data['discount_amount'] ?? 0) > 0 && empty($data['sale_id'])) {
            if (($data['payment_type'] ?? null) === Payment::TYPE_SALE_PAYMENT) {
                $errors['sale_id'][] = 'A sales invoice is required when applying a payment discount.';
            }
        }

        if (($data['payment_type'] ?? null) === Payment::TYPE_CUSTOMER_ADVANCE
            && (float) ($data['discount_amount'] ?? 0) > (float) ($data['amount'] ?? 0)) {
            $errors['discount_amount'][] = 'The advance discount cannot exceed the advance amount.';
        }

        if (empty($data['account_id'])) {
            $errors['account_id'][] = 'The account field is required.';
        }

        if (empty($data['paying_method'])) {
            $errors['paying_method'][] = 'The paying method field is required.';
        }

        $this->validateTypeMatrix($data, $errors);

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function validateTypeMatrix(array $data, array &$errors): void
    {
        $type = $data['payment_type'] ?? null;
        $direction = $data['direction'] ?? null;

        $rules = [
            Payment::TYPE_SALE_PAYMENT => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_IN, 'allowed_document' => 'sale_id'],
            Payment::TYPE_CUSTOMER_ADVANCE => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_IN],
            Payment::TYPE_PURCHASE_PAYMENT => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_OUT, 'allowed_document' => 'purchase_id'],
            Payment::TYPE_SUPPLIER_ADVANCE => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_OUT],
            Payment::TYPE_SALE_RETURN_REFUND => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_OUT, 'allowed_document' => 'sale_return_id'],
            Payment::TYPE_PURCHASE_RETURN_REFUND => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_IN, 'allowed_document' => 'purchase_return_id'],
        ];

        if (! isset($rules[$type])) {
            $errors['payment_type'][] = 'The selected payment type is invalid.';

            return;
        }

        $rule = $rules[$type];

        if (empty($data[$rule['party']])) {
            $errors[$rule['party']][] = "The {$rule['party']} field is required for {$type}.";
        }

        if ($direction !== $rule['direction']) {
            $errors['direction'][] = "The direction must be {$rule['direction']} for {$type}.";
        }

        $documentFields = ['sale_id', 'purchase_id', 'sale_return_id', 'purchase_return_id'];
        $allowedDocument = $rule['allowed_document'] ?? null;

        foreach ($documentFields as $field) {
            if ($field !== $allowedDocument && ! empty($data[$field])) {
                $errors[$field][] = "The {$field} field is not allowed for {$type}.";
            }
        }
    }

    private function validateDocumentBranch(array $data, User $user): void
    {
        $billerId = $user->requireCurrentBillerId();
        $checks = [
            'sale_id' => [Sale::class, 'sale_id'],
            'purchase_id' => [Purchase::class, 'purchase_id'],
            'sale_return_id' => [ReturnInvoice::class, 'sale_return_id'],
            'purchase_return_id' => [ReturnPurchase::class, 'purchase_return_id'],
        ];

        foreach ($checks as $field => [$model, $errorKey]) {
            if (empty($data[$field])) {
                continue;
            }

            $belongsToBranch = $model::query()
                ->whereKey($data[$field])
                ->where('biller_id', $billerId)
                ->exists();

            if (! $belongsToBranch) {
                throw ValidationException::withMessages([
                    $errorKey => ['The linked invoice does not belong to the selected branch.'],
                ]);
            }
        }
    }

    public function validatePaymentForApproval(Payment $payment): void
    {
        if (! $payment->sale_id) {
            if ($payment->payment_type === Payment::TYPE_CUSTOMER_ADVANCE) {
                if ((float) ($payment->discount_amount ?? 0) > (float) $payment->amount) {
                    throw ValidationException::withMessages([
                        'discount_amount' => ['The advance discount cannot exceed the advance amount.'],
                    ]);
                }

                return;
            }

            if ((float) ($payment->discount_amount ?? 0) > 0) {
                throw ValidationException::withMessages([
                    'discount_amount' => ['A payment discount requires a linked sales invoice.'],
                ]);
            }

            return;
        }

        $this->assertSettlementWithinDue(
            (int) $payment->sale_id,
            (float) $payment->amount,
            (float) ($payment->discount_amount ?? 0)
        );
    }

    private function validateSaleSettlement(array $data): void
    {
        if (($data['payment_type'] ?? null) !== Payment::TYPE_SALE_PAYMENT || empty($data['sale_id'])) {
            return;
        }

        Sale::query()->lockForUpdate()->findOrFail($data['sale_id']);
        $this->assertSettlementWithinDue(
            (int) $data['sale_id'],
            (float) $data['amount'],
            (float) ($data['discount_amount'] ?? 0)
        );
    }

    private function assertSettlementWithinDue(int $saleId, float $amount, float $discount): void
    {
        $sale = Sale::query()->findOrFail($saleId);
        $alreadySettled = (float) Payment::query()
            ->where('sale_id', $saleId)
            ->where('payment_type', Payment::TYPE_SALE_PAYMENT)
            ->where('direction', Payment::DIRECTION_IN)
            ->where('approval_status', ApprovalService::APPROVED)
            ->selectRaw('COALESCE(SUM(amount + COALESCE(discount_amount, 0)), 0) as settled_total')
            ->value('settled_total');
        $due = max(round((float) $sale->grand_total - $alreadySettled, 2), 0);
        $settlement = round($amount + $discount, 2);

        if ($settlement > $due) {
            throw ValidationException::withMessages([
                'amount' => ['Payment amount plus discount cannot exceed the current invoice due.'],
                'discount_amount' => ['Payment amount plus discount cannot exceed the current invoice due.'],
            ]);
        }
    }

    private function referenceFor(string $type): string
    {
        $prefix = match ($type) {
            Payment::TYPE_SALE_PAYMENT => 'spr',
            Payment::TYPE_CUSTOMER_ADVANCE => 'cap',
            Payment::TYPE_PURCHASE_PAYMENT => 'ppr',
            Payment::TYPE_SUPPLIER_ADVANCE => 'sap',
            Payment::TYPE_SALE_RETURN_REFUND => 'srr',
            Payment::TYPE_PURCHASE_RETURN_REFUND => 'prr',
            default => 'pay',
        };

        return $prefix.'-'.date('Ymd').'-'.date('His');
    }

    private function salePaymentStatus(float $paidAmount, float $grandTotal): int
    {
        if ($paidAmount <= 0) {
            return 2;
        }

        return abs($grandTotal - $paidAmount) < 0.01 || $paidAmount > $grandTotal ? 4 : 3;
    }

    private function purchasePaymentStatus(float $paidAmount, float $grandTotal): int
    {
        if ($paidAmount <= 0) {
            return 3;
        }

        return abs($grandTotal - $paidAmount) < 0.01 || $paidAmount > $grandTotal ? 2 : 1;
    }
}
