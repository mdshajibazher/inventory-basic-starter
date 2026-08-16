<?php

namespace App\Http\Requests;

use App\Models\Payment;
use App\Services\ApprovalService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StorePaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where('is_active', true)],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('is_active', true)],
            'sale_id' => ['nullable', 'integer', 'exists:sales,id'],
            'purchase_id' => ['nullable', 'integer', 'exists:purchases,id'],
            'sale_return_id' => ['nullable', 'integer', 'exists:returns,id'],
            'purchase_return_id' => ['nullable', 'integer', 'exists:return_purchases,id'],
            'cash_register_id' => ['nullable', 'integer', 'exists:cash_registers,id'],
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'payment_type' => ['required', 'string', Rule::in([
                Payment::TYPE_SALE_PAYMENT,
                Payment::TYPE_CUSTOMER_ADVANCE,
                Payment::TYPE_PURCHASE_PAYMENT,
                Payment::TYPE_SUPPLIER_ADVANCE,
                Payment::TYPE_SALE_RETURN_REFUND,
                Payment::TYPE_PURCHASE_RETURN_REFUND,
            ])],
            'direction' => ['nullable', 'string', Rule::in([Payment::DIRECTION_IN, Payment::DIRECTION_OUT])],
            'amount' => ['required', 'numeric', 'gt:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'change' => ['nullable', 'numeric', 'min:0'],
            'paying_method' => ['required', 'string', 'max:255'],
            'payment_note' => ['nullable', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $hasCustomer = filled($this->input('customer_id'));
            $hasSupplier = filled($this->input('supplier_id'));

            if ($hasCustomer === $hasSupplier) {
                $validator->errors()->add('customer_id', 'A payment must belong to exactly one customer or supplier.');
                $validator->errors()->add('supplier_id', 'A payment must belong to exactly one customer or supplier.');
            }

            $this->validatePaymentType($validator);
        });
    }

    private function validatePaymentType(Validator $validator): void
    {
        $type = $this->input('payment_type');
        $direction = $this->input('direction');

        $rules = [
            Payment::TYPE_SALE_PAYMENT => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_IN, 'document' => 'sale_id'],
            Payment::TYPE_CUSTOMER_ADVANCE => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_IN],
            Payment::TYPE_PURCHASE_PAYMENT => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_OUT, 'document' => 'purchase_id'],
            Payment::TYPE_SUPPLIER_ADVANCE => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_OUT],
            Payment::TYPE_SALE_RETURN_REFUND => ['party' => 'customer_id', 'direction' => Payment::DIRECTION_OUT, 'document' => 'sale_return_id'],
            Payment::TYPE_PURCHASE_RETURN_REFUND => ['party' => 'supplier_id', 'direction' => Payment::DIRECTION_IN, 'document' => 'purchase_return_id'],
        ];

        if (! isset($rules[$type])) {
            return;
        }

        $rule = $rules[$type];

        if (blank($this->input($rule['party']))) {
            $validator->errors()->add($rule['party'], "The {$rule['party']} field is required for {$type}.");
        }

        if ($direction !== null && $direction !== $rule['direction']) {
            $validator->errors()->add('direction', "The direction must be {$rule['direction']} for {$type}.");
        }

        $allowedDocument = $rule['document'] ?? null;

        foreach (['sale_id', 'purchase_id', 'sale_return_id', 'purchase_return_id'] as $documentField) {
            if ($documentField !== $allowedDocument && filled($this->input($documentField))) {
                $validator->errors()->add($documentField, "The {$documentField} field is not allowed for {$type}.");
            }
        }

        if ($allowedDocument) {
            $this->validateApprovedDocument($validator, $allowedDocument);
        }
    }

    private function validateApprovedDocument(Validator $validator, string $documentField): void
    {
        $documentId = $this->input($documentField);

        if (blank($documentId)) {
            return;
        }

        $table = match ($documentField) {
            'sale_id' => 'sales',
            'purchase_id' => 'purchases',
            'sale_return_id' => 'returns',
            'purchase_return_id' => 'return_purchases',
            default => null,
        };

        if (! $table) {
            return;
        }

        $approved = DB::table($table)
            ->where('id', $documentId)
            ->where('approval_status', ApprovalService::APPROVED)
            ->exists();

        if (! $approved) {
            $validator->errors()->add($documentField, 'The linked invoice must be approved before recording a payment.');
        }
    }
}
