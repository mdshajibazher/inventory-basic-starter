<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\GeneralSetting;
use App\Models\Payment;
use App\Models\ReturnInvoice;
use App\Models\Sale;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class CustomerLedgerService
{
    public function statement(Customer $customer, ?string $from, ?string $to): array
    {
        $fromDate = $from ? CarbonImmutable::parse($from)->startOfDay() : null;
        $toDate = $to ? CarbonImmutable::parse($to)->endOfDay() : null;
        $rows = $this->rows($customer, $toDate);

        $openingBalance = $this->initialBalance($customer);
        $rangeRows = collect();

        foreach ($rows as $row) {
            if ($fromDate && CarbonImmutable::parse($row['date'])->lt($fromDate)) {
                $openingBalance += $row['debit'] - $row['credit'];

                continue;
            }

            $rangeRows->push($row);
        }

        $balance = round($openingBalance, 2);
        $debitTotal = 0.0;
        $creditTotal = 0.0;

        $rangeRows = $rangeRows->map(function (array $row) use (&$balance, &$debitTotal, &$creditTotal) {
            $debitTotal += $row['debit'];
            $creditTotal += $row['credit'];
            $balance = round($balance + $row['debit'] - $row['credit'], 2);
            $row['balance'] = $balance;

            return $row;
        })->values();

        return [
            'company' => $this->company(),
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'company_name' => $customer->company_name,
                'email' => $customer->email,
                'phone_number' => $customer->phone_number,
                'address' => $this->customerAddress($customer),
            ],
            'filters' => [
                'from' => $fromDate?->toDateString(),
                'to' => $toDate?->toDateString(),
                'printed_at' => now()->toIso8601String(),
            ],
            'opening_balance' => round($openingBalance, 2),
            'rows' => $rangeRows,
            'totals' => [
                'debit' => round($debitTotal, 2),
                'credit' => round($creditTotal, 2),
                'closing_balance' => $balance,
            ],
        ];
    }

    private function rows(Customer $customer, ?CarbonImmutable $toDate): Collection
    {
        return collect()
            ->merge($this->sales($customer, $toDate))
            ->merge($this->returns($customer, $toDate))
            ->merge($this->payments($customer, $toDate))
            ->sortBy([
                ['date', 'asc'],
                ['sort_order', 'asc'],
                ['id', 'asc'],
            ])
            ->values();
    }

    private function sales(Customer $customer, ?CarbonImmutable $toDate): Collection
    {
        return Sale::query()
            ->with(['products.product:id,name,code', 'products.variant:id,name'])
            ->where('customer_id', $customer->id)
            ->when($toDate, fn ($query) => $query->whereDate('sale_date', '<=', $toDate->toDateString()))
            ->get()
            ->map(fn (Sale $sale) => [
                'id' => $sale->id,
                'type' => 'sale',
                'sort_order' => 10,
                'date' => $this->dateString($sale->sale_date, $sale->created_at),
                'bill' => $sale->reference_no,
                'particular' => 'sales',
                'debit' => round((float) $sale->grand_total, 2),
                'credit' => 0.0,
                'product_lines' => $this->productLines($sale->products),
            ]);
    }

    private function returns(Customer $customer, ?CarbonImmutable $toDate): Collection
    {
        return ReturnInvoice::query()
            ->with(['products.product:id,name,code', 'products.variant:id,name'])
            ->where('customer_id', $customer->id)
            ->when($toDate, fn ($query) => $query->whereDate('return_date', '<=', $toDate->toDateString()))
            ->get()
            ->map(fn (ReturnInvoice $return) => [
                'id' => $return->id,
                'type' => 'return',
                'sort_order' => 20,
                'date' => $this->dateString($return->return_date, $return->created_at),
                'bill' => $return->reference_no,
                'particular' => 'return',
                'debit' => 0.0,
                'credit' => round((float) $return->grand_total, 2),
                'product_lines' => $this->productLines($return->products),
            ]);
    }

    private function payments(Customer $customer, ?CarbonImmutable $toDate): Collection
    {
        return Payment::query()
            ->where('customer_id', $customer->id)
            ->where(function ($query) {
                $query->where('approval_status', ApprovalService::APPROVED)
                    ->orWhereNull('approval_status');
            })
            ->when($toDate, fn ($query) => $query->whereDate('created_at', '<=', $toDate->toDateString()))
            ->get()
            ->map(function (Payment $payment) {
                $cashAmount = round((float) $payment->amount, 2);
                $discountAmount = round((float) ($payment->discount_amount ?? 0), 2);
                $amount = round($payment->payment_type === Payment::TYPE_CUSTOMER_ADVANCE
                    ? max($cashAmount - $discountAmount, 0)
                    : $cashAmount + $discountAmount, 2);
                $isDebit = $payment->direction === Payment::DIRECTION_OUT;

                return [
                    'id' => $payment->id,
                    'type' => 'payment',
                    'sort_order' => 30,
                    'date' => $this->dateString(null, $payment->created_at),
                    'bill' => $payment->payment_reference,
                    'particular' => $this->paymentParticular($payment),
                    'debit' => $isDebit ? $amount : 0.0,
                    'credit' => $isDebit ? 0.0 : $amount,
                    'cash_amount' => $cashAmount,
                    'discount_amount' => $discountAmount,
                    'product_lines' => [],
                ];
            });
    }

    private function productLines(Collection $lines): array
    {
        return $lines->map(function ($line) {
            $name = $line->product?->name ?? 'Product #'.$line->product_id;

            if ($line->variant?->name) {
                $name .= ' - '.$line->variant->name;
            }

            return sprintf(
                '%s (%s x %s) = %s',
                $name,
                $this->number($line->qty),
                $this->number($line->net_unit_price),
                $this->number($line->total)
            );
        })->all();
    }

    private function paymentParticular(Payment $payment): string
    {
        $method = trim((string) $payment->paying_method);
        $note = trim((string) $payment->payment_note);
        $label = $payment->direction === Payment::DIRECTION_OUT ? 'refund' : 'payment';

        if ($method !== '') {
            $label = $method;
        }

        return $note !== '' ? "{$label}\n({$note})" : $label;
    }

    private function initialBalance(Customer $customer): float
    {
        return round((float) ($customer->expense ?? 0) - (float) ($customer->deposit ?? 0), 2);
    }

    private function customerAddress(Customer $customer): string
    {
        return collect([
            $customer->address,
            $customer->city,
            $customer->state,
            $customer->postal_code,
            $customer->country,
        ])->filter()->implode(', ');
    }

    private function company(): array
    {
        $settings = GeneralSetting::query()->first();

        return [
            'name' => $settings?->company_name ?: 'Vision Trade International',
            'address' => $settings?->company_address ?: '26/1, 26/2 Dr. Kudrot-E-Khuda Road, Eastern Mollika Shopping Complex, Elephant Road, Dhaka-1205.',
            'email' => $settings?->company_email ?: 'visioncosmetics82@gmail.com',
            'phone' => $settings?->company_phone ?: '01778284863',
        ];
    }

    private function dateString($date, $fallback): string
    {
        return ($date ?: $fallback)->toDateString();
    }

    private function number($value): string
    {
        return rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.');
    }
}
