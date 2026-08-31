<?php

namespace Tests\Unit;

use App\Models\Biller;
use App\Models\Customer;
use App\Models\GeneralSetting;
use App\Models\Product;
use App\Models\ProductSale;
use App\Models\Sale;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class SalesInvoiceSnapshotServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('general_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('company_name')->nullable();
            $table->string('company_address')->nullable();
            $table->string('company_email')->nullable();
            $table->string('company_phone')->nullable();
            $table->timestamps();
        });

        GeneralSetting::query()->create([
            'company_name' => 'Vision Trade International',
            'company_address' => '26/1 Elephant Road, Dhaka',
            'company_email' => 'sales@vision.example.test',
            'company_phone' => '01900000000',
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('general_settings');
        Mockery::close();

        parent::tearDown();
    }

    public function test_snapshot_keeps_only_customer_visible_invoice_data(): void
    {
        $sale = Mockery::mock(Sale::class)->makePartial();
        $sale->shouldReceive('loadMissing')->once()->with([
            'customer:id,name,email,phone_number,address,city,state,postal_code,country',
            'biller:id,name,company_name,email,phone_number,address,city,state,postal_code,country',
            'warehouse:id,name',
            'approver:id,name',
            'products.product:id,name,code',
            'products.variant:id,name',
            'products.batch:id,batch_no',
            'products.unit:id,unit_code,unit_name',
        ])->andReturnSelf();
        $sale->forceFill([
            'id' => 73,
            'reference_no' => 'SI-2026-00073',
            'sale_date' => '2026-08-29',
            'customer_id' => 9,
            'warehouse_id' => 3,
            'biller_id' => 5,
            'total_qty' => 12,
            'total_discount' => 0,
            'total_tax' => 600,
            'total_price' => 6000,
            'order_tax_rate' => 0,
            'order_tax' => 0,
            'order_discount' => 0,
            'coupon_discount' => 0,
            'shipping_cost' => 0,
            'grand_total' => 6600,
            'sale_status' => 1,
            'payment_status' => 2,
            'paid_amount' => 6600,
            'sale_note' => 'Deliver after 5 PM.',
            'staff_note' => 'Never customer-visible.',
            'approval_status' => 'approved',
            'approved_by' => 11,
            'approved_at' => '2026-08-29 10:30:00',
        ]);
        $sale->setRelation('customer', (new Customer)->forceFill([
            'id' => 9,
            'name' => 'Amina Rahman',
            'email' => 'amina@example.test',
            'phone_number' => '01700000000',
            'address' => '12 Lake Road',
            'city' => 'Dhaka',
            'state' => 'Dhaka',
            'postal_code' => '1205',
            'country' => 'Bangladesh',
        ]));
        $sale->setRelation('biller', (new Biller)->forceFill([
            'id' => 5,
            'name' => 'Dhaka Branch',
            'company_name' => 'Branch Company',
            'email' => 'branch@example.test',
            'phone_number' => '01800000000',
            'address' => 'Branch address',
            'city' => 'Dhaka',
            'state' => 'Dhaka',
            'postal_code' => '1206',
            'country' => 'Bangladesh',
        ]));
        $sale->setRelation('warehouse', (new Warehouse)->forceFill(['id' => 3, 'name' => 'Main Warehouse']));
        $sale->setRelation('approver', (new User)->forceFill(['id' => 11, 'name' => 'Manager']));
        $sale->setRelation('products', collect([
            $this->line([
                'product_id' => 4,
                'qty' => 12,
                'net_unit_price' => 500,
                'discount' => 0,
                'tax_rate' => 10,
                'tax_method' => 2,
                'tax' => 600,
                'total' => 6600,
                'unit_cost' => 300,
                'total_cost' => 3600,
            ]),
        ]));

        $snapshot = (new SalesInvoiceSnapshotService)->snapshot($sale);

        $this->assertSame([
            'schema_version' => 1,
            'invoice' => [
                'id' => 73,
                'reference_no' => 'SI-2026-00073',
                'sale_date' => '2026-08-29',
                'sale_status' => 1,
                'payment_status' => 2,
                'warehouse' => ['id' => 3, 'name' => 'Main Warehouse'],
                'currency' => 'BDT',
                'total_qty' => 12.0,
                'total_price' => 6000.0,
                'total_discount' => 0.0,
                'total_tax' => 600.0,
                'order_tax_rate' => 0.0,
                'order_tax' => 0.0,
                'order_discount' => 0.0,
                'coupon_discount' => 0.0,
                'shipping_cost' => 0.0,
                'grand_total' => 6600.0,
                'paid_amount' => 6600.0,
                'sale_note' => 'Deliver after 5 PM.',
                'approval_status' => 'approved',
                'approved_by' => 11,
                'approved_at' => '2026-08-29T10:30:00+00:00',
                'approver' => ['id' => 11, 'name' => 'Manager'],
            ],
            'company' => [
                'id' => 5,
                'name' => 'Vision Trade International',
                'email' => 'sales@vision.example.test',
                'phone_number' => '01900000000',
                'address' => '26/1 Elephant Road, Dhaka',
                'city' => 'Dhaka',
                'state' => 'Dhaka',
                'postal_code' => '1206',
                'country' => 'Bangladesh',
            ],
            'customer' => [
                'id' => 9,
                'name' => 'Amina Rahman',
                'email' => 'amina@example.test',
                'phone_number' => '01700000000',
                'address' => '12 Lake Road',
                'city' => 'Dhaka',
                'state' => 'Dhaka',
                'postal_code' => '1205',
                'country' => 'Bangladesh',
            ],
            'lines' => [[
                'key' => '4:null:null:1:1',
                'product_id' => 4,
                'product_name' => 'Face Wash',
                'product_code' => 'FW-101',
                'variant' => null,
                'batch' => null,
                'unit' => 'pc',
                'qty' => 12.0,
                'unit_price' => 550.0,
                'discount' => 0.0,
                'tax_rate' => 10.0,
                'tax' => 600.0,
                'total' => 6600.0,
            ]],
        ], $snapshot);

        $this->assertNoInternalCostKeys($snapshot);
    }

    public function test_diff_reports_only_customer_visible_line_and_total_changes(): void
    {
        $before = [
            'invoice' => [
                'total_price' => 5500.0,
                'total_discount' => 0.0,
                'order_discount' => 0.0,
                'coupon_discount' => 0.0,
                'order_tax' => 0.0,
                'shipping_cost' => 0.0,
                'grand_total' => 5500.0,
            ],
            'lines' => [
                $this->snapshotLine('1:null:null:1:1', 1, 1, 100.0),
                $this->snapshotLine('4:null:null:1:1', 4, 10, 5500.0),
                $this->snapshotLine('7:null:null:1:1', 7, 2, 200.0),
            ],
        ];
        $after = [
            'invoice' => [
                'total_price' => 6600.0,
                'total_discount' => 0.0,
                'order_discount' => 0.0,
                'coupon_discount' => 0.0,
                'order_tax' => 0.0,
                'shipping_cost' => 0.0,
                'grand_total' => 6600.0,
            ],
            'lines' => [
                $this->snapshotLine('1:null:null:1:1', 1, 1, 100.0),
                $this->snapshotLine('4:null:null:1:1', 4, 12, 6600.0),
                $this->snapshotLine('9:null:null:1:1', 9, 1, 100.0),
            ],
        ];

        $diff = (new SalesInvoiceSnapshotService)->diff($before, $after);

        $this->assertSame([$this->snapshotLine('9:null:null:1:1', 9, 1, 100.0)], $diff['added_lines']);
        $this->assertSame([$this->snapshotLine('7:null:null:1:1', 7, 2, 200.0)], $diff['removed_lines']);
        $this->assertSame([[
            'key' => '4:null:null:1:1',
            'before' => $this->snapshotLine('4:null:null:1:1', 4, 10, 5500.0),
            'after' => $this->snapshotLine('4:null:null:1:1', 4, 12, 6600.0),
            'fields' => [
                'qty' => ['before' => 10.0, 'after' => 12.0],
                'total' => ['before' => 5500.0, 'after' => 6600.0],
            ],
        ]], $diff['modified_lines']);
        $this->assertSame([
            'total_price' => ['before' => 5500.0, 'after' => 6600.0],
            'grand_total' => ['before' => 5500.0, 'after' => 6600.0],
        ], $diff['changed_totals']);
    }

    public function test_snapshot_numbers_duplicate_line_keys_by_product_variant_batch_and_unit(): void
    {
        $sale = Mockery::mock(Sale::class)->makePartial();
        $sale->shouldReceive('loadMissing')->once()->andReturnSelf();
        $sale->setRelation('customer', null);
        $sale->setRelation('biller', null);
        $sale->setRelation('warehouse', null);
        $sale->setRelation('approver', null);
        $sale->setRelation('products', collect([
            $this->line(['product_id' => 1, 'qty' => 1, 'net_unit_price' => 100, 'total' => 100]),
            $this->line(['product_id' => 4, 'qty' => 1, 'net_unit_price' => 100, 'total' => 100]),
            $this->line(['product_id' => 4, 'qty' => 1, 'net_unit_price' => 100, 'total' => 100]),
        ]));

        $snapshot = (new SalesInvoiceSnapshotService)->snapshot($sale);

        $this->assertSame(['1:null:null:1:1', '4:null:null:1:1', '4:null:null:1:2'], array_column($snapshot['lines'], 'key'));
    }

    public function test_diff_ignores_reversed_duplicate_lines_with_distinct_visible_values(): void
    {
        $first = $this->line(['product_id' => 4, 'qty' => 1, 'net_unit_price' => 100, 'total' => 100]);
        $second = $this->line(['product_id' => 4, 'qty' => 2, 'net_unit_price' => 150, 'total' => 300]);
        $service = new SalesInvoiceSnapshotService;

        $before = $service->snapshot($this->saleWithProducts([$first, $second]));
        $after = $service->snapshot($this->saleWithProducts([$second, $first]));

        $this->assertSame($before['lines'], $after['lines']);
        $this->assertSame([
            'added_lines' => [],
            'removed_lines' => [],
            'modified_lines' => [],
            'changed_totals' => [],
        ], $service->diff($before, $after));
    }

    private function saleWithProducts(array $lines): Sale
    {
        $sale = Mockery::mock(Sale::class)->makePartial();
        $sale->shouldReceive('loadMissing')->once()->andReturnSelf();
        $sale->setRelation('customer', null);
        $sale->setRelation('biller', null);
        $sale->setRelation('warehouse', null);
        $sale->setRelation('approver', null);
        $sale->setRelation('products', collect($lines));

        return $sale;
    }

    private function line(array $attributes): ProductSale
    {
        $line = (new ProductSale)->forceFill($attributes + [
            'variant_id' => null,
            'product_batch_id' => null,
            'sale_unit_id' => 1,
        ]);
        $line->setRelation('product', (new Product)->forceFill(['id' => 4, 'name' => 'Face Wash', 'code' => 'FW-101']));
        $line->setRelation('variant', null);
        $line->setRelation('batch', null);
        $line->setRelation('unit', (new Unit)->forceFill(['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece']));

        return $line;
    }

    private function snapshotLine(string $key, int $productId, float $qty, float $total): array
    {
        return [
            'key' => $key,
            'product_id' => $productId,
            'product_name' => "Product {$productId}",
            'product_code' => "P-{$productId}",
            'variant' => null,
            'batch' => null,
            'unit' => 'pc',
            'qty' => $qty,
            'unit_price' => 100.0,
            'discount' => 0.0,
            'tax_rate' => 0.0,
            'tax' => 0.0,
            'total' => $total,
        ];
    }

    private function assertNoInternalCostKeys(array $value): void
    {
        foreach ($value as $key => $item) {
            $this->assertNotContains($key, ['unit_cost', 'total_cost', 'profit']);

            if (is_array($item)) {
                $this->assertNoInternalCostKeys($item);
            }
        }
    }
}
