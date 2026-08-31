<?php

namespace App\Services;

use App\Models\GeneralSetting;
use App\Models\ProductSale;
use App\Models\Sale;
use DateTimeInterface;
use Illuminate\Support\Carbon;

class SalesInvoiceSnapshotService
{
    private const LINE_FIELDS = ['qty', 'unit', 'unit_price', 'discount', 'tax_rate', 'tax', 'total'];

    private const TOTAL_FIELDS = [
        'total_price',
        'total_discount',
        'order_discount',
        'coupon_discount',
        'order_tax',
        'shipping_cost',
        'grand_total',
    ];

    public function snapshot(Sale $sale): array
    {
        $sale->loadMissing([
            'customer:id,name,email,phone_number,address,city,state,postal_code,country',
            'biller:id,name,company_name,email,phone_number,address,city,state,postal_code,country',
            'warehouse:id,name',
            'approver:id,name',
            'products.product:id,name,code,tax_method',
            'products.variant:id,name',
            'products.batch:id,batch_no',
            'products.unit:id,unit_code,unit_name',
        ]);

        $settings = GeneralSetting::query()->latest('id')->first();
        $biller = $sale->biller;
        $customer = $sale->customer;
        $occurrences = [];

        return [
            'schema_version' => 1,
            'invoice' => [
                'id' => $this->integer($sale->id),
                'reference_no' => $sale->reference_no,
                'sale_date' => $this->date($sale->sale_date),
                'sale_status' => $sale->sale_status,
                'payment_status' => $sale->payment_status,
                'warehouse' => [
                    'id' => $this->integer($sale->warehouse?->id),
                    'name' => $sale->warehouse?->name,
                ],
                'currency' => 'BDT',
                'total_qty' => $this->quantity($sale->total_qty),
                'total_price' => $this->money($sale->total_price),
                'total_discount' => $this->money($sale->total_discount),
                'total_tax' => $this->money($sale->total_tax),
                'order_tax_rate' => $this->money($sale->order_tax_rate),
                'order_tax' => $this->money($sale->order_tax),
                'order_discount' => $this->money($sale->order_discount),
                'coupon_discount' => $this->money($sale->coupon_discount),
                'shipping_cost' => $this->money($sale->shipping_cost),
                'grand_total' => $this->money($sale->grand_total),
                'paid_amount' => $this->money($sale->paid_amount),
                'sale_note' => $sale->sale_note,
                'approval_status' => $sale->approval_status,
                'approved_by' => $this->integer($sale->approved_by),
                'approved_at' => $this->dateTime($sale->approved_at),
                'approver' => [
                    'id' => $this->integer($sale->approver?->id),
                    'name' => $sale->approver?->name,
                ],
            ],
            'company' => [
                'id' => $this->integer($biller?->id),
                'name' => $settings?->company_name ?: $biller?->company_name ?: $biller?->name,
                'email' => $settings?->company_email ?: $biller?->email,
                'phone_number' => $settings?->company_phone ?: $biller?->phone_number,
                'address' => $settings?->company_address ?: $biller?->address,
                'city' => $biller?->city,
                'state' => $biller?->state,
                'postal_code' => $biller?->postal_code,
                'country' => $biller?->country,
            ],
            'customer' => [
                'id' => $this->integer($customer?->id),
                'name' => $customer?->name,
                'email' => $customer?->email,
                'phone_number' => $customer?->phone_number,
                'address' => $customer?->address,
                'city' => $customer?->city,
                'state' => $customer?->state,
                'postal_code' => $customer?->postal_code,
                'country' => $customer?->country,
            ],
            'lines' => $sale->products
                ->sortBy(fn (ProductSale $line): string => $this->lineIdentity($line).':'.$this->lineSortKey($line))
                ->values()
                ->map(function (ProductSale $line) use (&$occurrences): array {
                    $identity = $this->lineIdentity($line);
                    $occurrences[$identity] = ($occurrences[$identity] ?? 0) + 1;

                    return $this->snapshotLine($line, $occurrences[$identity]);
                })->all(),
        ];
    }

    public function diff(array $before, array $after): array
    {
        $beforeLines = $this->indexLines($before['lines'] ?? []);
        $afterLines = $this->indexLines($after['lines'] ?? []);

        $modifiedLines = [];
        foreach (array_intersect_key($beforeLines, $afterLines) as $key => $beforeLine) {
            $afterLine = $afterLines[$key];
            $fields = [];

            foreach (self::LINE_FIELDS as $field) {
                if ($beforeLine[$field] !== $afterLine[$field]) {
                    $fields[$field] = ['before' => $beforeLine[$field], 'after' => $afterLine[$field]];
                }
            }

            if ($fields !== []) {
                $modifiedLines[] = [
                    'key' => $key,
                    'before' => $beforeLine,
                    'after' => $afterLine,
                    'fields' => $fields,
                ];
            }
        }

        $changedTotals = [];
        foreach (self::TOTAL_FIELDS as $field) {
            $beforeTotal = $this->money($before['invoice'][$field] ?? 0);
            $afterTotal = $this->money($after['invoice'][$field] ?? 0);

            if ($beforeTotal !== $afterTotal) {
                $changedTotals[$field] = ['before' => $beforeTotal, 'after' => $afterTotal];
            }
        }

        return [
            'added_lines' => array_values(array_diff_key($afterLines, $beforeLines)),
            'removed_lines' => array_values(array_diff_key($beforeLines, $afterLines)),
            'modified_lines' => $modifiedLines,
            'changed_totals' => $changedTotals,
        ];
    }

    private function snapshotLine(ProductSale $line, int $occurrence): array
    {
        $productId = $this->integer($line->product_id);
        $qty = $this->quantity($line->qty);
        $discount = $this->money($line->discount);
        $taxMethod = $line->getAttribute('tax_method') ?? $line->product?->tax_method;

        $unitPrice = (int) $taxMethod === 2 && $qty > 0
            ? $this->money(($this->money($line->total) + $discount) / $qty)
            : $this->money($line->net_unit_price);

        return [
            'key' => $this->lineIdentity($line).":{$occurrence}",
            'product_id' => $productId,
            'product_name' => $line->product?->name,
            'product_code' => $line->product?->code,
            'variant' => $line->variant?->name,
            'batch' => $line->batch?->batch_no,
            'unit' => $line->unit?->unit_code ?: $line->unit?->unit_name,
            'qty' => $qty,
            'unit_price' => $unitPrice,
            'discount' => $discount,
            'tax_rate' => $this->money($line->tax_rate),
            'tax' => $this->money($line->tax),
            'total' => $this->money($line->total),
        ];
    }

    private function indexLines(array $lines): array
    {
        $indexed = [];

        foreach ($lines as $line) {
            $normalised = $this->normaliseLine($line);
            $indexed[$normalised['key']] = $normalised;
        }

        return $indexed;
    }

    private function normaliseLine(array $line): array
    {
        return [
            'key' => (string) ($line['key'] ?? ''),
            'product_id' => $this->integer($line['product_id'] ?? null),
            'product_name' => $line['product_name'] ?? null,
            'product_code' => $line['product_code'] ?? null,
            'variant' => $line['variant'] ?? null,
            'batch' => $line['batch'] ?? null,
            'unit' => $line['unit'] ?? null,
            'qty' => $this->quantity($line['qty'] ?? 0),
            'unit_price' => $this->money($line['unit_price'] ?? 0),
            'discount' => $this->money($line['discount'] ?? 0),
            'tax_rate' => $this->money($line['tax_rate'] ?? 0),
            'tax' => $this->money($line['tax'] ?? 0),
            'total' => $this->money($line['total'] ?? 0),
        ];
    }

    private function integer(mixed $value): ?int
    {
        return $value === null ? null : (int) $value;
    }

    private function money(mixed $value): float
    {
        return round((float) ($value ?? 0), 2);
    }

    private function quantity(mixed $value): float
    {
        return round((float) ($value ?? 0), 4);
    }

    private function lineIdentity(ProductSale $line): string
    {
        return implode(':', [
            $this->integer($line->product_id) ?? 'null',
            $this->integer($line->variant_id) ?? 'null',
            $this->integer($line->product_batch_id) ?? 'null',
            $this->integer($line->sale_unit_id) ?? 'null',
        ]);
    }

    private function lineSortKey(ProductSale $line): string
    {
        return json_encode($this->snapshotLine($line, 0), JSON_PRESERVE_ZERO_FRACTION);
    }

    private function date(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return $value instanceof DateTimeInterface
            ? $value->format('Y-m-d')
            : Carbon::parse($value)->toDateString();
    }

    private function dateTime(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return $value instanceof DateTimeInterface
            ? $value->format(DateTimeInterface::ATOM)
            : Carbon::parse($value)->toAtomString();
    }
}
