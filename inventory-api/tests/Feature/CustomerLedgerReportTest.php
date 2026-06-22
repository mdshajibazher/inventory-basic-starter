<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductReturn;
use App\Models\ProductSale;
use App\Models\ReturnInvoice;
use App\Models\Sale;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Tests\TestCase;

class CustomerLedgerReportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('customers', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('customer_group_id');
            $table->string('name');
            $table->string('company_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone_number');
            $table->string('address');
            $table->string('city');
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('country')->nullable();
            $table->double('deposit')->nullable();
            $table->double('expense')->nullable();
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });

        Schema::create('general_settings', function (Blueprint $table) {
            $table->increments('id');
            $table->string('site_title');
            $table->string('company_name')->nullable();
            $table->text('company_address')->nullable();
            $table->string('company_email')->nullable();
            $table->string('company_phone')->nullable();
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

        Schema::create('returns', function (Blueprint $table) {
            $table->increments('id');
            $table->string('reference_no');
            $table->date('return_date')->nullable();
            $table->integer('customer_id');
            $table->integer('warehouse_id');
            $table->integer('biller_id');
            $table->integer('item');
            $table->double('total_qty');
            $table->double('total_discount');
            $table->double('total_tax');
            $table->double('total_price');
            $table->double('order_tax_rate')->nullable();
            $table->double('order_tax')->nullable();
            $table->double('grand_total');
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('purchase_id')->nullable();
            $table->integer('user_id')->nullable();
            $table->integer('sale_id')->nullable();
            $table->integer('sale_return_id')->nullable();
            $table->integer('purchase_return_id')->nullable();
            $table->integer('cash_register_id')->nullable();
            $table->integer('account_id');
            $table->integer('customer_id')->nullable();
            $table->integer('supplier_id')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_type')->nullable();
            $table->string('direction')->nullable();
            $table->double('amount');
            $table->double('change')->nullable();
            $table->string('paying_method');
            $table->text('payment_note')->nullable();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->timestamps();
        });

        Schema::create('variants', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('product_sales', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('sale_id');
            $table->date('date')->nullable();
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->double('qty');
            $table->integer('sale_unit_id');
            $table->double('net_unit_price');
            $table->double('discount');
            $table->double('tax_rate');
            $table->double('tax');
            $table->double('total');
            $table->timestamps();
        });

        Schema::create('product_returns', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('return_id');
            $table->date('date')->nullable();
            $table->integer('product_id');
            $table->integer('variant_id')->nullable();
            $table->double('qty');
            $table->integer('sale_unit_id');
            $table->double('net_unit_price');
            $table->double('discount');
            $table->double('tax_rate');
            $table->double('tax');
            $table->double('total');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        foreach (['product_returns', 'product_sales', 'variants', 'products', 'payments', 'returns', 'sales', 'general_settings', 'customers'] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_customer_ledger_calculates_opening_running_balance_and_totals(): void
    {
        $this->withoutMiddleware([
            Authenticate::class,
            PermissionMiddleware::class,
        ]);

        \App\Models\GeneralSetting::create([
            'site_title' => 'Inventory Management',
            'company_name' => 'Vision Trade International',
            'company_email' => 'test@example.com',
        ]);

        $customer = Customer::create([
            'customer_group_id' => 1,
            'name' => 'Md Sayeed',
            'email' => null,
            'phone_number' => '01712803590',
            'address' => 'Bogura',
            'city' => 'Bogura',
            'deposit' => 10,
            'expense' => 40,
            'is_active' => true,
        ]);
        $product = Product::create(['name' => 'Elegant Baby', 'code' => 'EB']);

        $openingSale = Sale::create($this->salePayload($customer->id, 'S-OPEN', '2021-12-31', 200));
        ProductSale::create($this->productSalePayload($openingSale->id, $product->id, '2021-12-31', 2, 100, 200));

        $sale = Sale::create($this->salePayload($customer->id, 'S-100', '2022-01-01', 340));
        ProductSale::create($this->productSalePayload($sale->id, $product->id, '2022-01-01', 2, 170, 340));

        $return = ReturnInvoice::create($this->returnPayload($customer->id, 'R-100', '2022-01-02', 60));
        ProductReturn::create($this->productReturnPayload($return->id, $product->id, '2022-01-02', 1, 60, 60));

        DB::table('payments')->insert($this->paymentPayload($customer->id, 'P-100', '2022-01-03 10:00:00', Payment::DIRECTION_IN, 100, Payment::TYPE_CUSTOMER_ADVANCE));
        DB::table('payments')->insert($this->paymentPayload($customer->id, 'RF-100', '2022-01-04 10:00:00', Payment::DIRECTION_OUT, 25, Payment::TYPE_SALE_RETURN_REFUND));

        $response = $this->getJson("/api/customers/{$customer->id}/ledger?from=2022-01-01&to=2022-01-31");

        $response
            ->assertOk()
            ->assertJsonPath('data.company.name', 'Vision Trade International')
            ->assertJsonPath('data.company.email', 'test@example.com')
            ->assertJsonPath('data.customer.name', 'Md Sayeed')
            ->assertJsonPath('data.opening_balance', 230)
            ->assertJsonPath('data.rows.0.bill', 'S-100')
            ->assertJsonPath('data.rows.0.debit', 340)
            ->assertJsonPath('data.rows.0.balance', 570)
            ->assertJsonPath('data.rows.1.bill', 'R-100')
            ->assertJsonPath('data.rows.1.credit', 60)
            ->assertJsonPath('data.rows.1.balance', 510)
            ->assertJsonPath('data.rows.2.bill', 'P-100')
            ->assertJsonPath('data.rows.2.credit', 100)
            ->assertJsonPath('data.rows.2.balance', 410)
            ->assertJsonPath('data.rows.3.bill', 'RF-100')
            ->assertJsonPath('data.rows.3.debit', 25)
            ->assertJsonPath('data.rows.3.balance', 435)
            ->assertJsonPath('data.totals.debit', 365)
            ->assertJsonPath('data.totals.credit', 160)
            ->assertJsonPath('data.totals.closing_balance', 435);
    }

    private function salePayload(int $customerId, string $reference, string $date, float $grandTotal): array
    {
        return [
            'reference_no' => $reference,
            'sale_date' => $date,
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
            'payment_status' => 3,
            'paid_amount' => 0,
        ];
    }

    private function returnPayload(int $customerId, string $reference, string $date, float $grandTotal): array
    {
        return [
            'reference_no' => $reference,
            'return_date' => $date,
            'customer_id' => $customerId,
            'warehouse_id' => 1,
            'biller_id' => 1,
            'item' => 1,
            'total_qty' => 1,
            'total_discount' => 0,
            'total_tax' => 0,
            'total_price' => $grandTotal,
            'order_tax_rate' => 0,
            'order_tax' => 0,
            'grand_total' => $grandTotal,
        ];
    }

    private function productSalePayload(int $saleId, int $productId, string $date, float $qty, float $price, float $total): array
    {
        return [
            'sale_id' => $saleId,
            'date' => $date,
            'product_id' => $productId,
            'qty' => $qty,
            'sale_unit_id' => 0,
            'net_unit_price' => $price,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => $total,
        ];
    }

    private function productReturnPayload(int $returnId, int $productId, string $date, float $qty, float $price, float $total): array
    {
        return [
            'return_id' => $returnId,
            'date' => $date,
            'product_id' => $productId,
            'qty' => $qty,
            'sale_unit_id' => 0,
            'net_unit_price' => $price,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => $total,
        ];
    }

    private function paymentPayload(int $customerId, string $reference, string $createdAt, string $direction, float $amount, string $type): array
    {
        return [
            'account_id' => 1,
            'customer_id' => $customerId,
            'payment_reference' => $reference,
            'payment_type' => $type,
            'direction' => $direction,
            'amount' => $amount,
            'change' => 0,
            'paying_method' => 'Cash',
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ];
    }
}
