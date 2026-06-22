<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Supplier;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class InvoiceOutstandingFilterTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('customers', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('customer_group_id');
            $table->string('name');
            $table->string('phone_number');
            $table->string('address');
            $table->string('city');
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('company_name');
            $table->string('email');
            $table->string('phone_number');
            $table->string('address');
            $table->string('city');
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('billers', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('purchase_statuses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('value');
            $table->string('label');
            $table->timestamps();
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('sale_date')->nullable();
            $table->integer('customer_id');
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->integer('item');
            $table->double('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_price');
            $table->double('grand_total');
            $table->integer('sale_status');
            $table->integer('payment_status');
            $table->double('paid_amount')->nullable();
            $table->timestamps();
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('purchase_date')->nullable();
            $table->integer('warehouse_id');
            $table->integer('supplier_id')->nullable();
            $table->integer('item');
            $table->integer('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_cost');
            $table->double('grand_total');
            $table->double('paid_amount');
            $table->integer('status');
            $table->integer('payment_status');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        foreach (['purchases', 'sales', 'purchase_statuses', 'billers', 'warehouses', 'suppliers', 'customers'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_sales_invoice_options_can_return_only_outstanding_invoices(): void
    {
        $this->withoutMiddleware();

        $customer = Customer::create([
            'customer_group_id' => 1,
            'name' => 'Test Customer',
            'phone_number' => '123',
            'address' => 'Dhaka',
            'city' => 'Dhaka',
            'is_active' => true,
        ]);

        $openSale = Sale::create($this->salePayload($customer->id, 'sale-open', 100, 40));
        Sale::create($this->salePayload($customer->id, 'sale-paid', 100, 100));

        $response = $this->getJson('/api/sales-invoices?outstanding_only=1&customer_id='.$customer->id);

        $response
            ->assertOk()
            ->assertJsonPath('data.0.id', $openSale->id)
            ->assertJsonPath('data.0.due_amount', 60)
            ->assertJsonMissing(['reference_no' => 'sale-paid']);
    }

    public function test_purchase_invoice_options_can_return_only_outstanding_invoices(): void
    {
        $this->withoutMiddleware();

        $supplier = Supplier::create([
            'name' => 'Test Supplier',
            'company_name' => 'Test Supplier Ltd',
            'email' => 'supplier@example.test',
            'phone_number' => '123',
            'address' => 'Dhaka',
            'city' => 'Dhaka',
            'is_active' => true,
        ]);

        $openPurchase = Purchase::create($this->purchasePayload($supplier->id, 'purchase-open', 250, 25));
        Purchase::create($this->purchasePayload($supplier->id, 'purchase-paid', 250, 250));

        $response = $this->getJson('/api/purchase-invoices?outstanding_only=1&supplier_id='.$supplier->id);

        $response
            ->assertOk()
            ->assertJsonPath('data.0.id', $openPurchase->id)
            ->assertJsonPath('data.0.due_amount', 225)
            ->assertJsonMissing(['reference_no' => 'purchase-paid']);
    }

    private function salePayload(int $customerId, string $reference, float $grandTotal, float $paidAmount): array
    {
        return [
            'reference_no' => $reference,
            'customer_id' => $customerId,
            'warehouse_id' => 1,
            'biller_id' => 1,
            'item' => 1,
            'total_qty' => 1,
            'total_discount' => 0,
            'total_tax' => 0,
            'total_price' => $grandTotal,
            'grand_total' => $grandTotal,
            'sale_status' => 1,
            'payment_status' => $paidAmount >= $grandTotal ? 4 : 3,
            'paid_amount' => $paidAmount,
        ];
    }

    private function purchasePayload(int $supplierId, string $reference, float $grandTotal, float $paidAmount): array
    {
        return [
            'reference_no' => $reference,
            'warehouse_id' => 1,
            'supplier_id' => $supplierId,
            'item' => 1,
            'total_qty' => 1,
            'total_discount' => 0,
            'total_tax' => 0,
            'total_cost' => $grandTotal,
            'grand_total' => $grandTotal,
            'paid_amount' => $paidAmount,
            'status' => 1,
            'payment_status' => $paidAmount >= $grandTotal ? 2 : 1,
        ];
    }
}
