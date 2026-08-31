<?php

namespace Tests\Unit;

use App\Models\Product;
use App\Models\Tax;
use App\Services\InvoiceLineTaxCalculator;
use PHPUnit\Framework\TestCase;

class InvoiceLineTaxCalculatorTest extends TestCase
{
    public function test_exclusive_tax_is_added_to_the_entered_price(): void
    {
        $result = (new InvoiceLineTaxCalculator)->calculate(100, 1, 0, 10, 1);

        $this->assertSame([
            'unit_price' => 100.0,
            'net_unit_price' => 100.0,
            'discount' => 0.0,
            'tax_rate' => 10.0,
            'tax_method' => 1,
            'tax' => 10.0,
            'subtotal' => 110.0,
        ], $result);
    }

    public function test_inclusive_tax_is_extracted_from_the_entered_price(): void
    {
        $result = (new InvoiceLineTaxCalculator)->calculate(100, 1, 0, 10, 2);

        $this->assertSame([
            'unit_price' => 100.0,
            'net_unit_price' => 90.91,
            'discount' => 0.0,
            'tax_rate' => 10.0,
            'tax_method' => 2,
            'tax' => 9.09,
            'subtotal' => 100.0,
        ], $result);
    }

    public function test_inclusive_tax_handles_quantity_and_line_discount(): void
    {
        $result = (new InvoiceLineTaxCalculator)->calculate(100, 2, 20, 10, 2);

        $this->assertSame(91.82, $result['net_unit_price']);
        $this->assertSame(16.36, $result['tax']);
        $this->assertSame(180.0, $result['subtotal']);
    }

    public function test_inclusive_product_uses_its_configured_tax_rate_instead_of_the_submitted_rate(): void
    {
        $product = (new Product)->forceFill(['tax_method' => 2]);
        $product->setRelation('tax', (new Tax)->forceFill(['rate' => 10]));

        $result = (new InvoiceLineTaxCalculator)->calculateForProduct($product, 100, 1, 0, 99);

        $this->assertSame(10.0, $result['tax_rate']);
        $this->assertSame(9.09, $result['tax']);
        $this->assertSame(100.0, $result['subtotal']);
    }

    public function test_exclusive_product_keeps_the_editable_submitted_tax_rate(): void
    {
        $product = (new Product)->forceFill(['tax_method' => 1]);
        $product->setRelation('tax', (new Tax)->forceFill(['rate' => 10]));

        $result = (new InvoiceLineTaxCalculator)->calculateForProduct($product, 100, 1, 0, 15);

        $this->assertSame(15.0, $result['tax_rate']);
        $this->assertSame(15.0, $result['tax']);
        $this->assertSame(115.0, $result['subtotal']);
    }
}
