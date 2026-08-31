<?php

namespace Tests\Feature;

use App\Jobs\SendApprovedSalesInvoiceEmail;
use App\Mail\ApprovedSalesInvoiceMail;
use App\Models\Customer;
use App\Models\GeneralSetting;
use App\Models\ProductSale;
use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use App\Models\User;
use App\Services\RecordNotificationService;
use App\Services\SalesInvoicePdfRenderer;
use App\Services\SalesInvoiceRevisionService;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class ApprovedSalesInvoiceDispatchTest extends TestCase
{
    private SalesInvoiceRevisionService $revisions;

    private RecordNotificationService $notifications;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('customers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone_number')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('country')->nullable();
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('password')->nullable();
            $table->timestamps();
        });
        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->string('unit_code');
            $table->string('unit_name');
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('code');
            $table->timestamps();
        });
        Schema::create('sales', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_no');
            $table->date('sale_date')->nullable();
            $table->foreignId('customer_id')->nullable();
            $table->foreignId('user_id')->nullable();
            $table->foreignId('warehouse_id')->nullable();
            $table->foreignId('biller_id')->nullable();
            $table->unsignedInteger('item')->default(0);
            $table->decimal('total_qty', 15, 4)->default(0);
            $table->decimal('total_price', 15, 2)->default(0);
            $table->decimal('total_discount', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('order_tax_rate', 15, 2)->default(0);
            $table->decimal('order_tax', 15, 2)->default(0);
            $table->decimal('order_discount', 15, 2)->default(0);
            $table->decimal('coupon_discount', 15, 2)->default(0);
            $table->decimal('shipping_cost', 15, 2)->default(0);
            $table->decimal('grand_total', 15, 2)->default(0);
            $table->unsignedTinyInteger('sale_status')->default(1);
            $table->unsignedTinyInteger('payment_status')->default(2);
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->text('sale_note')->nullable();
            $table->string('approval_status', 16)->default('pending');
            $table->foreignId('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
        Schema::create('product_sales', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sale_id');
            $table->foreignId('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->unsignedBigInteger('product_batch_id')->nullable();
            $table->decimal('qty', 15, 4);
            $table->foreignId('sale_unit_id')->nullable();
            $table->decimal('net_unit_price', 15, 2);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('tax_rate', 15, 2)->default(0);
            $table->unsignedTinyInteger('tax_method')->default(1);
            $table->decimal('tax', 15, 2)->default(0);
            $table->decimal('total', 15, 2);
            $table->timestamps();
        });
        Schema::create('general_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('company_name')->nullable();
            $table->string('company_address')->nullable();
            $table->string('company_email')->nullable();
            $table->string('company_phone')->nullable();
            $table->boolean('customer_sales_invoice_mail_notification_enabled')->default(false);
            $table->boolean('customer_sales_invoice_sms_notification_enabled')->default(false);
            $table->string('bulksmsbd_api_url')->nullable();
            $table->string('bulksmsbd_api_key')->nullable();
            $table->string('bulksmsbd_sender_id')->nullable();
            $table->timestamps();
        });
        Schema::create('email_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('email');
            $table->string('subject');
            $table->text('message');
            $table->string('status');
            $table->string('provider')->nullable();
            $table->text('provider_response')->nullable();
            $table->string('record_type')->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->timestamps();
        });
        Schema::create('sms_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('phone_number');
            $table->text('message');
            $table->string('status');
            $table->string('provider')->nullable();
            $table->text('provider_response')->nullable();
            $table->string('record_type')->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->timestamps();
        });

        $migration = require database_path('migrations/2026_08_30_000002_create_sales_invoice_revisions_table.php');
        $migration->up();

        DB::table('units')->insert([
            'id' => 1,
            'unit_code' => 'pc',
            'unit_name' => 'Piece',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->revisions = new SalesInvoiceRevisionService(new SalesInvoiceSnapshotService);
        $this->notifications = new RecordNotificationService($this->revisions);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('sales_invoice_revisions');
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('sms_logs');
        Schema::dropIfExists('general_settings');
        Schema::dropIfExists('product_sales');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('products');
        Schema::dropIfExists('units');
        Schema::dropIfExists('users');
        Schema::dropIfExists('customers');

        parent::tearDown();
    }

    public function test_enabled_setting_finalizes_and_queues_one_delivery_after_commit(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale, $pending] = $this->pendingRevision('customer@example.test', 100);
        $approvedAt = now()->startOfSecond();
        $sale->update([
            'grand_total' => 125,
            'approval_status' => 'approved',
            'approved_at' => $approvedAt,
        ]);

        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());

        $revision = $pending->fresh();
        $this->assertSame(SalesInvoiceRevision::STATUS_QUEUED, $revision->delivery_status);
        $this->assertSame('customer@example.test', $revision->recipient_email);
        $this->assertEquals(125.0, $revision->after_snapshot['invoice']['grand_total']);
        $this->assertSame('approved', $revision->after_snapshot['invoice']['approval_status']);
        $this->assertTrue($approvedAt->equalTo($revision->approved_at));
        $this->assertNotNull($revision->queued_at);
        $this->assertNull($revision->failure_message);
        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, function (SendApprovedSalesInvoiceEmail $job) use ($revision): bool {
            return $job->revisionId === $revision->id && $job->afterCommit === true;
        });
        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
    }

    public function test_disabled_setting_marks_the_revision_skipped_without_queueing(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: false);
        [$sale, $pending] = $this->pendingRevision('customer@example.test');
        $this->approve($sale);

        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());

        $this->assertSame(SalesInvoiceRevision::STATUS_SKIPPED, $pending->fresh()->delivery_status);
        $this->assertSame('Customer sales invoice email disabled.', $pending->fresh()->failure_message);
        Queue::assertNothingPushed();
    }

    #[DataProvider('blankEmails')]
    public function test_missing_or_blank_email_marks_the_revision_skipped_without_queueing(?string $email): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale, $pending] = $this->pendingRevision($email);
        $this->approve($sale);

        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());

        $this->assertSame(SalesInvoiceRevision::STATUS_SKIPPED, $pending->fresh()->delivery_status);
        $this->assertSame('Customer email missing.', $pending->fresh()->failure_message);
        Queue::assertNothingPushed();
    }

    /** @return array<string, array{?string}> */
    public static function blankEmails(): array
    {
        return [
            'null' => [null],
            'empty' => [''],
            'whitespace' => ['   '],
        ];
    }

    public function test_calling_customer_approval_twice_does_not_push_twice(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale] = $this->pendingRevision('customer@example.test');
        $this->approve($sale);

        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());

        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
        $this->assertSame(1, SalesInvoiceRevision::query()->count());
    }

    public function test_finalized_values_stay_immutable_after_the_live_sale_is_edited(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale, $pending] = $this->pendingRevision('original@example.test', 100);
        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        $finalized = $pending->fresh();

        $sale->update([
            'grand_total' => 999,
            'approved_at' => now()->addDay(),
        ]);
        $sale->customer()->update(['email' => 'changed@example.test']);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());

        $revision = $pending->fresh();
        $this->assertSame($finalized->after_snapshot, $revision->after_snapshot);
        $this->assertTrue($finalized->approved_at->equalTo($revision->approved_at));
        $this->assertSame('original@example.test', $revision->recipient_email);
        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
    }

    public function test_finalization_rejects_a_sale_that_is_not_approved(): void
    {
        [$sale] = $this->pendingRevision('customer@example.test');

        $this->expectException(LogicException::class);

        $this->revisions->finalizeApproved($sale);
    }

    public function test_create_time_customer_notification_keeps_sms_but_never_sends_email(): void
    {
        Mail::fake();
        Http::fake(['https://sms.example.test/*' => Http::response('202')]);
        $this->setting(emailEnabled: true, smsEnabled: true);
        [$sale] = $this->pendingRevision('customer@example.test');

        $this->notifications->salesInvoiceCreatedForCustomer($sale);

        Mail::assertNothingOutgoing();
        Http::assertSent(fn ($request): bool => $request['number'] === '01700000000');
        $this->assertDatabaseHas('sms_logs', [
            'record_type' => 'customer_sales_invoice',
            'record_id' => $sale->id,
            'phone_number' => '01700000000',
            'status' => 'submitted',
        ]);
    }

    public function test_delivery_job_declares_the_retry_contract(): void
    {
        $job = new SendApprovedSalesInvoiceEmail(123);

        $this->assertInstanceOf(ShouldQueue::class, $job);
        $this->assertSame(123, $job->revisionId);
        $this->assertSame(3, $job->tries);
        $this->assertSame([60, 300], $job->backoff());
    }

    public function test_first_approval_after_pending_edits_sends_one_created_email_with_latest_full_lines_and_no_diff(): void
    {
        Mail::fake();
        Queue::fake();
        $this->setting(emailEnabled: true);
        $faceWash = $this->product('Face Wash', 'FW-101');
        $soap = $this->product('Soap', 'SP-201');
        [$sale] = $this->pendingRevision('customer@example.test', 200, [
            [$faceWash, 1, 100],
            [$soap, 1, 100],
        ]);

        $this->revisions->beginUpdate($sale);
        $this->replaceLines($sale, [
            [$faceWash, 2, 125],
            [$soap, 3, 50],
        ]);
        $sale->update([
            'total_qty' => 5,
            'total_price' => 400,
            'grand_total' => 400,
        ]);
        $pending = $this->revisions->syncPending($sale->fresh());

        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
        (new SendApprovedSalesInvoiceEmail($pending->id))->handle($this->pdfRenderer());

        Mail::assertSent(ApprovedSalesInvoiceMail::class, fn (ApprovedSalesInvoiceMail $mail): bool => $mail->hasTo('customer@example.test'));
        Mail::assertSentCount(1);
        $revision = $pending->fresh();
        $this->assertSame(SalesInvoiceRevision::KIND_CREATED, $revision->kind);
        $this->assertNull($revision->before_snapshot);
        $this->assertNull($revision->changes);
        $this->assertSame(['FW-101', 'SP-201'], array_column($revision->after_snapshot['lines'], 'product_code'));
        $this->assertEquals([2.0, 3.0], array_column($revision->after_snapshot['lines'], 'qty'));
        $this->assertEquals([125.0, 50.0], array_column($revision->after_snapshot['lines'], 'unit_price'));
        $this->assertEquals(400.0, $revision->after_snapshot['invoice']['grand_total']);
        $this->assertSame(SalesInvoiceRevision::STATUS_SENT, $revision->delivery_status);
    }

    public function test_reapproval_sends_one_updated_email_with_full_lines_all_change_classes_and_old_and_new_totals(): void
    {
        Mail::fake();
        Queue::fake();
        $this->setting(emailEnabled: true);
        $faceWash = $this->product('Face Wash', 'FW-101');
        $soap = $this->product('Soap', 'SP-201');
        $lotion = $this->product('Lotion', 'LT-301');
        $shampoo = $this->product('Shampoo', 'SH-401');
        [$sale] = $this->pendingRevision('customer@example.test', 600, [
            [$faceWash, 1, 100],
            [$soap, 1, 200],
            [$lotion, 1, 300],
        ]);
        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        $created = SalesInvoiceRevision::query()->sole();
        (new SendApprovedSalesInvoiceEmail($created->id))->handle($this->pdfRenderer());

        Mail::fake();
        Queue::fake();
        $this->revisions->beginUpdate($sale->fresh());
        $this->replaceLines($sale, [
            [$faceWash, 2, 125],
            [$lotion, 1, 300],
            [$shampoo, 1, 100],
        ]);
        $sale->update([
            'item' => 3,
            'total_qty' => 4,
            'total_price' => 650,
            'grand_total' => 650,
            'approval_status' => 'pending',
            'approved_by' => null,
            'approved_at' => null,
        ]);
        $updated = $this->revisions->syncPending($sale->fresh());

        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
        (new SendApprovedSalesInvoiceEmail($updated->id))->handle($this->pdfRenderer());

        Mail::assertSent(ApprovedSalesInvoiceMail::class, fn (ApprovedSalesInvoiceMail $mail): bool => $mail->hasSubject('Updated Sales Invoice Approved: SI-2026-00001'));
        Mail::assertSentCount(1);
        $revision = $updated->fresh();
        $this->assertSame(SalesInvoiceRevision::KIND_UPDATED, $revision->kind);
        $this->assertSame(['FW-101', 'LT-301', 'SH-401'], array_column($revision->after_snapshot['lines'], 'product_code'));
        $this->assertSame(['SH-401'], array_column($revision->changes['added_lines'], 'product_code'));
        $this->assertSame(['SP-201'], array_column($revision->changes['removed_lines'], 'product_code'));
        $this->assertSame(['FW-101'], array_map(
            fn (array $change): string => $change['before']['product_code'],
            $revision->changes['modified_lines'],
        ));
        $this->assertEquals([
            'qty' => ['before' => 1.0, 'after' => 2.0],
            'unit_price' => ['before' => 100.0, 'after' => 125.0],
            'total' => ['before' => 100.0, 'after' => 250.0],
        ], $revision->changes['modified_lines'][0]['fields']);
        $this->assertEquals(['before' => 600.0, 'after' => 650.0], $revision->changes['changed_totals']['total_price']);
        $this->assertEquals(['before' => 600.0, 'after' => 650.0], $revision->changes['changed_totals']['grand_total']);
    }

    public function test_multiple_pending_edits_collapse_to_the_net_diff_from_the_last_approved_snapshot(): void
    {
        Mail::fake();
        Queue::fake();
        $this->setting(emailEnabled: true);
        $faceWash = $this->product('Face Wash', 'FW-101');
        $soap = $this->product('Soap', 'SP-201');
        $temporary = $this->product('Temporary Product', 'TMP-999');
        [$sale] = $this->pendingRevision('customer@example.test', 300, [
            [$faceWash, 1, 100],
            [$soap, 1, 200],
        ]);
        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        $created = SalesInvoiceRevision::query()->sole();
        (new SendApprovedSalesInvoiceEmail($created->id))->handle($this->pdfRenderer());

        Mail::fake();
        Queue::fake();
        $this->revisions->beginUpdate($sale->fresh());
        $this->replaceLines($sale, [
            [$faceWash, 2, 100],
            [$temporary, 1, 50],
        ]);
        $sale->update([
            'item' => 2,
            'total_qty' => 3,
            'total_price' => 250,
            'grand_total' => 250,
            'approval_status' => 'pending',
            'approved_at' => null,
        ]);
        $firstPending = $this->revisions->syncPending($sale->fresh());

        $this->replaceLines($sale, [
            [$faceWash, 3, 100],
            [$soap, 1, 200],
        ]);
        $sale->update([
            'total_qty' => 4,
            'total_price' => 500,
            'grand_total' => 500,
        ]);
        $finalPending = $this->revisions->syncPending($sale->fresh());

        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        (new SendApprovedSalesInvoiceEmail($finalPending->id))->handle($this->pdfRenderer());

        Mail::assertSentCount(1);
        $revision = $finalPending->fresh();
        $this->assertSame($firstPending->id, $revision->id);
        $this->assertSame(2, SalesInvoiceRevision::query()->count());
        $this->assertSame([], $revision->changes['added_lines']);
        $this->assertSame([], $revision->changes['removed_lines']);
        $this->assertSame(['FW-101'], array_map(
            fn (array $change): string => $change['before']['product_code'],
            $revision->changes['modified_lines'],
        ));
        $this->assertEquals(['before' => 1.0, 'after' => 3.0], $revision->changes['modified_lines'][0]['fields']['qty']);
        $this->assertEquals(['before' => 300.0, 'after' => 500.0], $revision->changes['changed_totals']['grand_total']);
        $this->assertSame(['FW-101', 'SP-201'], array_column($revision->after_snapshot['lines'], 'product_code'));
    }

    public function test_delivery_failure_keeps_approval_records_error_allows_retry_and_suppresses_repeat_after_sent(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        $faceWash = $this->product('Face Wash', 'FW-101');
        [$sale] = $this->pendingRevision('customer@example.test', 100, [[$faceWash, 1, 100]]);
        $this->approve($sale);
        $this->notifications->salesInvoiceApprovedForCustomer($sale->fresh());
        $revision = SalesInvoiceRevision::query()->sole();
        $renderer = $this->pdfRenderer();
        $exception = new RuntimeException('SMTP unavailable');
        $mailManager = Mail::getFacadeRoot();
        $mailer = Mockery::mock();
        $mailer->shouldReceive('send')
            ->once()
            ->with(Mockery::type(ApprovedSalesInvoiceMail::class))
            ->andThrow($exception);
        Mail::shouldReceive('to')
            ->once()
            ->with('customer@example.test')
            ->andReturn($mailer);

        try {
            (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);
            $this->fail('The delivery exception was not rethrown for retry.');
        } catch (RuntimeException $caught) {
            $this->assertSame($exception, $caught);
        }

        $this->assertSame('approved', $sale->fresh()->approval_status);
        $this->assertNotNull($sale->fresh()->approved_at);
        $this->assertSame(SalesInvoiceRevision::STATUS_FAILED, $revision->fresh()->delivery_status);
        $this->assertSame('SMTP unavailable', $revision->fresh()->failure_message);
        $this->assertDatabaseHas('email_logs', [
            'record_type' => 'customer_sales_invoice',
            'record_id' => $sale->id,
            'status' => 'error',
            'provider_response' => 'Delivery failed; retry scheduled.',
        ]);

        Mail::swap($mailManager);
        Mail::fake();
        $job = new SendApprovedSalesInvoiceEmail($revision->id);
        $job->handle($renderer);
        $this->assertSame(SalesInvoiceRevision::STATUS_SENT, $revision->fresh()->delivery_status);
        Mail::assertSentCount(1);

        $job->handle($renderer);
        Mail::assertSentCount(1);
        $this->assertSame(2, DB::table('email_logs')->count());
    }

    /** @return array{Sale, SalesInvoiceRevision} */
    private function pendingRevision(?string $email, float $grandTotal = 100, array $lines = []): array
    {
        $customer = Customer::query()->create([
            'name' => 'Customer One',
            'email' => $email,
            'phone_number' => '01700000000',
        ]);
        $user = User::query()->create([
            'name' => 'Creator One',
            'email' => 'creator@example.test',
            'password' => 'unused',
        ]);
        $sale = Sale::query()->create([
            'reference_no' => 'SI-2026-00001',
            'customer_id' => $customer->id,
            'user_id' => $user->id,
            'grand_total' => $grandTotal,
            'total_price' => $grandTotal,
            'total_qty' => array_sum(array_column($lines, 1)),
            'item' => count($lines),
            'sale_date' => '2026-08-30',
            'approval_status' => 'pending',
        ]);

        $this->replaceLines($sale, $lines);

        return [$sale, $this->revisions->syncPending($sale)];
    }

    private function product(string $name, string $code): int
    {
        return DB::table('products')->insertGetId([
            'name' => $name,
            'code' => $code,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @param list<array{int, float|int, float|int}> $lines */
    private function replaceLines(Sale $sale, array $lines): void
    {
        ProductSale::query()->where('sale_id', $sale->id)->delete();

        foreach ($lines as [$productId, $quantity, $unitPrice]) {
            ProductSale::query()->create([
                'sale_id' => $sale->id,
                'product_id' => $productId,
                'qty' => $quantity,
                'sale_unit_id' => 1,
                'net_unit_price' => $unitPrice,
                'discount' => 0,
                'tax_rate' => 0,
                'tax_method' => 1,
                'tax' => 0,
                'total' => $quantity * $unitPrice,
            ]);
        }
    }

    private function pdfRenderer(): SalesInvoicePdfRenderer
    {
        return new class extends SalesInvoicePdfRenderer
        {
            public function render(array $snapshot): string
            {
                return '%PDF-test';
            }

            public function filename(array $snapshot): string
            {
                return 'sales-invoice-test.pdf';
            }
        };
    }

    private function setting(bool $emailEnabled, bool $smsEnabled = false): GeneralSetting
    {
        return GeneralSetting::query()->create([
            'customer_sales_invoice_mail_notification_enabled' => $emailEnabled,
            'customer_sales_invoice_sms_notification_enabled' => $smsEnabled,
            'bulksmsbd_api_url' => 'https://sms.example.test/send',
            'bulksmsbd_api_key' => 'test-key',
            'bulksmsbd_sender_id' => 'INV',
        ]);
    }

    private function approve(Sale $sale): void
    {
        $sale->update([
            'approval_status' => 'approved',
            'approved_at' => now()->startOfSecond(),
        ]);
    }
}
