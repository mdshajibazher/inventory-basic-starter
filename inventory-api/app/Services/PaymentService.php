<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Purchase;
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

            $payment = Payment::create([
                'user_id' => $user->id,
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
                'change' => round((float) ($data['change'] ?? 0), 2),
                'paying_method' => $data['paying_method'],
                'payment_note' => $data['payment_note'] ?? null,
            ]);

            $this->recalculateLinkedInvoice($payment);

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
            ->sum('amount');

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
            ->sum('amount');

        $purchase->paid_amount = min(round($paidAmount, 2), (float) $purchase->grand_total);
        $purchase->payment_status = $this->purchasePaymentStatus($purchase->paid_amount, (float) $purchase->grand_total);
        $purchase->save();
    }

    public function relations(): array
    {
        return [
            'account:id,name,account_no',
            'customer:id,name,email,phone_number',
            'supplier:id,name,email,phone_number',
            'sale:id,reference_no,grand_total',
            'purchase:id,reference_no,grand_total',
            'saleReturn:id,reference_no,grand_total',
            'purchaseReturn:id,reference_no,grand_total',
            'user:id,name,email',
        ];
    }

    private function normalize(array $data): array
    {
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
