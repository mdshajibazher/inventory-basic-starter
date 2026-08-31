<?php

namespace App\Services;

use App\Models\Product;

class InvoiceLineTaxCalculator
{
    public function calculateForProduct(Product $product, float $unitPrice, float $qty, float $discount, float $submittedTaxRate): array
    {
        $taxMethod = (int) ($product->tax_method ?? 1);
        $taxRate = $taxMethod === 2
            ? (float) ($product->tax?->rate ?? $submittedTaxRate)
            : $submittedTaxRate;

        return $this->calculate($unitPrice, $qty, $discount, $taxRate, $taxMethod);
    }

    public function calculate(float $unitPrice, float $qty, float $discount, float $taxRate, ?int $taxMethod): array
    {
        $unitPrice = max(0, $unitPrice);
        $qty = max(0, $qty);
        $discount = max(0, $discount);
        $taxRate = max(0, $taxRate);
        $taxMethod = $taxMethod === 2 ? 2 : 1;
        $enteredTotal = max(0, ($unitPrice * $qty) - $discount);
        $netTotal = $taxMethod === 2 && $taxRate > 0
            ? $enteredTotal * 100 / (100 + $taxRate)
            : $enteredTotal;
        $tax = $this->round($taxMethod === 2 ? $enteredTotal - $netTotal : $netTotal * $taxRate / 100);
        $subtotal = $this->round($taxMethod === 2 ? $enteredTotal : $netTotal + $tax);
        $netUnitPrice = $qty > 0 ? $this->round(($netTotal + $discount) / $qty) : 0.0;

        return [
            'unit_price' => $this->round($unitPrice),
            'net_unit_price' => $netUnitPrice,
            'discount' => $this->round($discount),
            'tax_rate' => $this->round($taxRate),
            'tax_method' => $taxMethod,
            'tax' => $tax,
            'subtotal' => $subtotal,
        ];
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
