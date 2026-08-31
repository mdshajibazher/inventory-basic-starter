<?php

namespace Tests\Unit;

use App\Http\Resources\ProductReturnResource;
use App\Http\Resources\ProductSaleResource;
use App\Models\ProductReturn;
use App\Models\ProductSale;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

class InvoiceLineTaxSnapshotResourceTest extends TestCase
{
    public function test_sales_line_exposes_its_tax_method_and_entered_inclusive_price(): void
    {
        $line = (new ProductSale)->forceFill([
            'qty' => 1,
            'net_unit_price' => 90.91,
            'discount' => 0,
            'tax_rate' => 10,
            'tax_method' => 2,
            'tax' => 9.09,
            'total' => 100,
        ]);

        $data = (new ProductSaleResource($line))->toArray(Request::create('/'));

        $this->assertSame(2, $data['tax_method']);
        $this->assertSame(100.0, $data['entered_unit_price']);
    }

    public function test_return_line_exposes_its_tax_method_and_entered_inclusive_price(): void
    {
        $line = (new ProductReturn)->forceFill([
            'qty' => 1,
            'net_unit_price' => 90.91,
            'discount' => 0,
            'tax_rate' => 10,
            'tax_method' => 2,
            'tax' => 9.09,
            'total' => 100,
        ]);

        $data = (new ProductReturnResource($line))->toArray(Request::create('/'));

        $this->assertSame(2, $data['tax_method']);
        $this->assertSame(100.0, $data['entered_unit_price']);
    }
}
