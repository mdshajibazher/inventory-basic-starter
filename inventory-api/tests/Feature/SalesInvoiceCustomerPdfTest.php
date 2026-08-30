<?php

namespace Tests\Feature;

use App\Models\Sale;
use App\Models\User;
use App\Services\ApprovalService;
use App\Services\SalesInvoicePdfRenderer;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\View;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Tests\TestCase;

class SalesInvoiceCustomerPdfTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->unsignedBigInteger('biller_id')->nullable();
            $table->unsignedBigInteger('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('sales', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_no')->nullable();
            $table->unsignedBigInteger('biller_id');
            $table->string('approval_status')->default(ApprovalService::PENDING);
            $table->timestamps();
        });

        View::addLocation(dirname(__DIR__, 2).'/resources/views');
        $this->withoutMiddleware(PermissionMiddleware::class);
        $this->app->instance(SalesInvoiceSnapshotService::class, new class($this->snapshot()) extends SalesInvoiceSnapshotService
        {
            public function __construct(private readonly array $fixture) {}

            public function snapshot(Sale $sale): array
            {
                return $this->fixture;
            }
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('sales');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_filename_sanitizes_the_reference_and_falls_back_to_the_sale_id(): void
    {
        $renderer = new SalesInvoicePdfRenderer;

        $this->assertSame(
            'sales-invoice-SR-2026-1042.pdf',
            $renderer->filename(['invoice' => ['id' => 42, 'reference_no' => 'SR 2026/1042']]),
        );
        $this->assertSame(
            'sales-invoice-42.pdf',
            $renderer->filename(['invoice' => ['id' => 42, 'reference_no' => ' / ']]),
        );
    }

    public function test_renderer_creates_a_complete_customer_safe_a4_invoice(): void
    {
        $snapshot = $this->snapshot();
        $html = View::make('invoices.customer-sales', [
            'snapshot' => $snapshot,
            'generatedAt' => now(),
        ])->render();

        foreach ([
            'Inventory Green Ltd',
            'A &amp; B Mart',
            'APPROVED',
            'SR-2026-1042',
            'Green Tea',
            'GT-01',
            'Large',
            'B-10',
            'Rice',
            'RC-02',
            'Subtotal',
            'Line Discount',
            'Order Discount',
            'Coupon Discount',
            'Order Tax',
            'Carrying Cost',
            'Grand Total',
            'Three Hundred Fifty-One Taka and Forty-One Paisa Only',
            'Deliver before 5 PM.',
        ] as $customerVisibleText) {
            $this->assertStringContainsString($customerVisibleText, $html);
        }

        $this->assertStringContainsString(
            '<td class="totals-label">Line Discount (included in subtotal)</td><td class="totals-value">BDT 4.75</td>',
            $html,
        );
        $this->assertStringNotContainsString(
            '<td class="totals-label">Line Discount (included in subtotal)</td><td class="totals-value">- BDT 4.75</td>',
            $html,
        );
        $this->assertStringContainsString(
            '<td class="totals-label">Order Tax (2.50%)</td><td class="totals-value">+ BDT 8.66</td>',
            $html,
        );
        $this->assertStringContainsString(
            '<td class="totals-label">Carrying Cost</td><td class="totals-value">+ BDT 5.00</td>',
            $html,
        );

        $displayedGrandTotal = 346.25 + 8.66 + 5.00 - 5.00 - 3.50;
        $this->assertSame($snapshot['invoice']['grand_total'], round($displayedGrandTotal, 2));

        foreach (['unit_cost', 'total_cost', 'cost price', 'profit'] as $internalText) {
            $this->assertStringNotContainsString($internalText, strtolower($html));
        }

        $bytes = (new SalesInvoicePdfRenderer)->render($snapshot);

        $this->assertStringStartsWith('%PDF-', $bytes);
        $this->assertGreaterThan(5000, strlen($bytes));
    }

    public function test_pending_invoice_pdf_download_is_forbidden(): void
    {
        [$user, $sale] = $this->endpointFixture(ApprovalService::PENDING);

        $this->actingAs($user)
            ->get("/api/sales-invoices/{$sale->id}/pdf")
            ->assertForbidden();
    }

    public function test_approved_invoice_pdf_download_uses_the_shared_renderer_and_exact_headers(): void
    {
        [$user, $sale] = $this->endpointFixture(ApprovalService::APPROVED);

        $response = $this->actingAs($user)
            ->get("/api/sales-invoices/{$sale->id}/pdf");

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Disposition', 'attachment; filename="sales-invoice-SR-2026-1042.pdf"');
        $this->assertStringStartsWith('%PDF-', (string) $response->getContent());
    }

    private function endpointFixture(string $approvalStatus): array
    {
        $userId = DB::table('users')->insertGetId([
            'name' => 'Invoice User',
            'email' => 'invoice-user@example.test',
            'biller_id' => 7,
            'current_biller_id' => 7,
            'biller_ids' => json_encode([7]),
            'is_active' => true,
            'is_deleted' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $saleId = DB::table('sales')->insertGetId([
            'reference_no' => 'SR-2026-1042',
            'biller_id' => 7,
            'approval_status' => $approvalStatus,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [User::query()->findOrFail($userId), Sale::query()->findOrFail($saleId)];
    }

    private function snapshot(): array
    {
        return [
            'schema_version' => 1,
            'invoice' => [
                'id' => 42,
                'reference_no' => 'SR-2026-1042',
                'sale_date' => '2026-08-30',
                'sale_status' => 1,
                'payment_status' => 2,
                'warehouse' => ['id' => 3, 'name' => 'Dhaka Main'],
                'currency' => 'BDT',
                'total_qty' => 3.25,
                'total_price' => 346.25,
                'total_discount' => 4.75,
                'total_tax' => 7.50,
                'order_tax_rate' => 2.50,
                'order_tax' => 8.66,
                'order_discount' => 5.00,
                'coupon_discount' => 3.50,
                'shipping_cost' => 5.00,
                'grand_total' => 351.41,
                'paid_amount' => 100.00,
                'sale_note' => 'Deliver before 5 PM.',
                'approval_status' => ApprovalService::APPROVED,
                'approved_at' => '2026-08-30T11:30:00+06:00',
                'approver' => ['id' => 9, 'name' => 'Amina Rahman'],
                'profit' => 120.00,
            ],
            'company' => [
                'name' => 'Inventory Green Ltd',
                'email' => 'hello@inventory-green.test',
                'phone_number' => '+880 1700 000000',
                'address' => '12 Green Road',
                'city' => 'Dhaka',
                'state' => 'Dhaka',
                'postal_code' => '1205',
                'country' => 'Bangladesh',
            ],
            'customer' => [
                'name' => 'A & B Mart',
                'email' => 'customer@example.test',
                'phone_number' => '+880 1800 000000',
                'address' => '45 Market Street',
                'city' => 'Chattogram',
                'state' => 'Chattogram',
                'postal_code' => '4000',
                'country' => 'Bangladesh',
            ],
            'lines' => [
                [
                    'key' => '1:null:10:1:1',
                    'product_name' => 'Green Tea',
                    'product_code' => 'GT-01',
                    'variant' => 'Large',
                    'batch' => 'B-10',
                    'qty' => 2.0,
                    'unit' => 'pcs',
                    'unit_price' => 125.50,
                    'discount' => 0.0,
                    'tax_rate' => 3.0,
                    'tax' => 7.50,
                    'total' => 251.0,
                    'unit_cost' => 71.0,
                    'total_cost' => 142.0,
                ],
                [
                    'key' => '2:null:null:2:1',
                    'product_name' => 'Rice',
                    'product_code' => 'RC-02',
                    'variant' => null,
                    'batch' => null,
                    'qty' => 1.25,
                    'unit' => 'kg',
                    'unit_price' => 80.0,
                    'discount' => 4.75,
                    'tax_rate' => 0.0,
                    'tax' => 0.0,
                    'total' => 95.25,
                    'unit_cost' => 50.0,
                    'total_cost' => 62.5,
                ],
            ],
        ];
    }
}
