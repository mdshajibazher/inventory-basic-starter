<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\SalesInvoiceController;
use App\Jobs\SendApprovedSalesInvoiceEmail;
use App\Mail\ApprovedSalesInvoiceMail;
use App\Models\Customer;
use App\Models\GeneralSetting;
use App\Models\ProductSale;
use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use App\Models\User;
use App\Services\ApprovalService;
use App\Services\RecordNotificationService;
use App\Services\SalesInvoicePdfRenderer;
use App\Services\SalesInvoiceRevisionService;
use App\Services\SalesInvoiceSnapshotService;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
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
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('model_has_permissions', function (Blueprint $table): void {
            $table->unsignedInteger('permission_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['permission_id', 'model_id', 'model_type']);
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
            $table->increments('id');
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
            $table->json('sales_invoice_approver_ids')->nullable();
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

        app(PermissionRegistrar::class)->forgetCachedPermissions();

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
        Schema::dropIfExists('model_has_permissions');
        Schema::dropIfExists('permissions');
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

        $this->notifyApproved($sale);

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

        $this->notifyApproved($sale);

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

        $this->notifyApproved($sale);

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

        $this->notifyApproved($sale);
        $this->notifyApproved($sale);

        Queue::assertPushedTimes(SendApprovedSalesInvoiceEmail::class, 1);
        $this->assertSame(1, SalesInvoiceRevision::query()->count());
    }

    public function test_finalized_values_stay_immutable_after_the_live_sale_is_edited(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale, $pending] = $this->pendingRevision('original@example.test', 100);
        $this->approve($sale);
        $this->notifyApproved($sale);
        $finalized = $pending->fresh();

        $sale->update([
            'grand_total' => 999,
            'approved_at' => now()->addDay(),
        ]);
        $sale->customer()->update(['email' => 'changed@example.test']);
        $this->notifyApproved($sale);

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
        $this->assertInstanceOf(ShouldBeUnique::class, $job);
        $this->assertSame(123, $job->revisionId);
        $this->assertSame(3, $job->tries);
        $this->assertSame([60, 300], $job->backoff());
        $this->assertSame(900, $job->uniqueFor);
        $this->assertSame('sales-invoice-revision:123', $job->uniqueId());

        $middleware = $job->middleware();

        $this->assertCount(1, $middleware);
        $this->assertInstanceOf(WithoutOverlapping::class, $middleware[0]);
        $this->assertSame('sales-invoice-revision:123', $middleware[0]->key);
        $this->assertSame(60, $middleware[0]->releaseAfter);
        $this->assertSame(900, $middleware[0]->expiresAfter);
    }

    public function test_dispatch_failure_leaves_the_approved_revision_pending_for_recovery(): void
    {
        $this->setting(emailEnabled: true);
        [$sale] = $this->pendingRevision('customer@example.test');
        $this->approve($sale);
        $revision = $this->revisions->finalizeApproved($sale->fresh());
        $realDispatcher = $this->app->make(Dispatcher::class);
        $dispatcher = Mockery::mock(Dispatcher::class);
        $dispatcher->shouldReceive('dispatch')
            ->once()
            ->andThrow(new RuntimeException('Database queue unavailable'));
        $this->app->instance(Dispatcher::class, $dispatcher);
        Log::spy();

        $this->revisions->queueCustomerDelivery($revision);

        $fresh = $revision->fresh();
        $this->assertSame(SalesInvoiceRevision::STATUS_PENDING, $fresh->delivery_status);
        $this->assertNull($fresh->queued_at);
        $this->assertSame('Queue dispatch failed; recovery will retry.', $fresh->failure_message);
        Log::shouldHaveReceived('error')
            ->once()
            ->with('Approved sales invoice email queue dispatch failed.', Mockery::on(fn (array $context): bool => $context === [
                'sale_id' => $revision->sale_id,
                'revision_id' => $revision->id,
                'recipient_email' => 'customer@example.test',
            ]));

        $this->app->instance(Dispatcher::class, $realDispatcher);
        Queue::fake();

        $this->assertSame(1, $this->revisions->recoverDeliveries());
        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $revision->id);
    }

    public function test_recovery_queues_approved_pending_and_stale_queued_revisions_but_leaves_a_fresh_lease_alone(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        $now = now()->startOfSecond();

        [$pendingSale] = $this->pendingRevision('pending@example.test');
        $this->approve($pendingSale);
        $pending = $this->revisions->finalizeApproved($pendingSale->fresh());

        [$staleSale] = $this->pendingRevision('stale@example.test');
        $this->approve($staleSale);
        $stale = $this->revisions->finalizeApproved($staleSale->fresh());
        $stale->update([
            'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
            'queued_at' => $now->copy()->subSeconds(901),
        ]);

        [$freshSale] = $this->pendingRevision('fresh@example.test');
        $this->approve($freshSale);
        $fresh = $this->revisions->finalizeApproved($freshSale->fresh());
        $freshQueuedAt = $now->copy()->subSeconds(899);
        $fresh->update([
            'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
            'queued_at' => $freshQueuedAt,
        ]);

        $recovered = $this->revisions->recoverDeliveries($now);

        $this->assertSame(2, $recovered);
        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $pending->id);
        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $stale->id);
        Queue::assertNotPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $fresh->id);
        $this->assertSame(SalesInvoiceRevision::STATUS_QUEUED, $pending->fresh()->delivery_status);
        $this->assertSame(SalesInvoiceRevision::STATUS_QUEUED, $stale->fresh()->delivery_status);
        $this->assertTrue($freshQueuedAt->equalTo($fresh->fresh()->queued_at));
    }

    public function test_recovery_command_is_scheduled_every_minute_without_overlap(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale] = $this->pendingRevision('customer@example.test');
        $this->approve($sale);
        $revision = $this->revisions->finalizeApproved($sale->fresh());

        $this->artisan('sales-invoice-emails:recover')
            ->expectsOutput('Recovered 1 approved sales invoice email delivery.')
            ->assertSuccessful();

        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $revision->id);
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($scheduled): bool => str_contains($scheduled->command, 'sales-invoice-emails:recover'));
        $this->assertNotNull($event);
        $this->assertSame('* * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    public function test_approval_service_finalizes_the_exact_revision_inside_the_sale_lock_transaction(): void
    {
        [$sale] = $this->pendingRevision('customer@example.test', 125);
        $this->setting(emailEnabled: true);
        $snapshots = new class extends SalesInvoiceSnapshotService
        {
            /** @var list<int> */
            public array $transactionLevels = [];

            public function snapshot(Sale $sale): array
            {
                $this->transactionLevels[] = DB::transactionLevel();

                return [
                    'schema_version' => 1,
                    'invoice' => [
                        'reference_no' => $sale->reference_no,
                        'grand_total' => round((float) $sale->grand_total, 2),
                        'approval_status' => $sale->approval_status,
                    ],
                    'customer' => ['email' => $sale->customer?->email],
                    'lines' => [],
                ];
            }
        };
        $approvals = new ApprovalService(new SalesInvoiceRevisionService($snapshots));
        $user = User::query()->findOrFail($sale->user_id);
        $this->grantSalesApproval($user);

        $approved = $approvals->approveSale($sale, $user);

        $this->assertTrue($approved->relationLoaded('approvedCustomerEmailRevision'));
        $revision = $approved->getRelation('approvedCustomerEmailRevision');
        $this->assertInstanceOf(SalesInvoiceRevision::class, $revision);
        $this->assertNotEmpty($snapshots->transactionLevels);
        $this->assertGreaterThan(0, min($snapshots->transactionLevels));
        $this->assertSame('approved', $revision->after_snapshot['invoice']['approval_status']);
        $this->assertEquals(125.0, $revision->after_snapshot['invoice']['grand_total']);

        $approved->update(['grand_total' => 999]);

        $this->assertEquals(125.0, $revision->fresh()->after_snapshot['invoice']['grand_total']);
    }

    public function test_approval_service_creates_a_first_revision_for_a_legacy_pending_sale_without_one(): void
    {
        $customer = Customer::query()->create([
            'name' => 'Legacy Customer',
            'email' => ' legacy@example.test ',
        ]);
        $user = User::query()->create([
            'name' => 'Legacy Creator',
            'email' => 'legacy-creator@example.test',
            'password' => 'unused',
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $sale = Sale::query()->create([
            'reference_no' => 'SI-2026-LEGACY',
            'customer_id' => $customer->id,
            'user_id' => $user->id,
            'grand_total' => 125,
            'total_price' => 125,
            'sale_date' => '2026-08-30',
            'approval_status' => 'pending',
        ]);
        $this->setting(emailEnabled: true);
        $this->grantSalesApproval($user);

        $approved = (new ApprovalService($this->revisions))->approveSale($sale, $user);

        $revision = $approved->getRelation('approvedCustomerEmailRevision');
        $this->assertInstanceOf(SalesInvoiceRevision::class, $revision);
        $this->assertSame(1, $revision->revision_number);
        $this->assertSame(SalesInvoiceRevision::KIND_CREATED, $revision->kind);
        $this->assertNull($revision->before_snapshot);
        $this->assertSame('legacy@example.test', $revision->recipient_email);
        $this->assertNull($revision->changes);
        $this->assertSame(SalesInvoiceRevision::STATUS_PENDING, $revision->delivery_status);
        $this->assertTrue($approved->approved_at->equalTo($revision->approved_at));
        $this->assertSame('approved', $revision->after_snapshot['invoice']['approval_status']);
    }

    public function test_controller_queues_the_finalized_revision_even_when_the_live_sale_changes_after_approval(): void
    {
        Queue::fake();
        $this->setting(emailEnabled: true);
        [$sale] = $this->pendingRevision('customer@example.test', 125);
        $this->approve($sale);
        $revision = $this->revisions->finalizeApproved($sale->fresh());
        $approved = $sale->fresh()->setRelation('approvedCustomerEmailRevision', $revision);
        $requestUser = $this->controllerUser();
        $request = Request::create("/api/sales-invoices/{$sale->id}/approve", 'POST');
        $request->setUserResolver(fn (): User => $requestUser);
        $approvals = Mockery::mock(ApprovalService::class);
        $approvals->shouldReceive('approveSale')->once()->with($sale, $requestUser)->andReturn($approved);
        $approvals->shouldReceive('canApprove')->andReturn(false);
        $this->app->instance(ApprovalService::class, $approvals);
        $notifications = Mockery::mock(RecordNotificationService::class);
        $notifications->shouldReceive('salesInvoiceApproved')
            ->once()
            ->with($approved)
            ->andReturnUsing(function (Sale $liveSale): void {
                $liveSale->update(['grand_total' => 999]);
            });
        $notifications->shouldReceive('salesInvoiceApprovedForCustomer')
            ->once()
            ->with(Mockery::on(fn ($queued): bool => $queued instanceof SalesInvoiceRevision && $queued->is($revision)))
            ->andReturnUsing(fn (SalesInvoiceRevision $queued) => $this->revisions->queueCustomerDelivery($queued));

        $response = (new SalesInvoiceController)->approve($sale, $request, $approvals, $notifications);

        $this->assertSame(200, $response->status());
        Queue::assertPushed(SendApprovedSalesInvoiceEmail::class, fn (SendApprovedSalesInvoiceEmail $job): bool => $job->revisionId === $revision->id);
        $this->assertEquals(125.0, $revision->fresh()->after_snapshot['invoice']['grand_total']);
        $this->assertEquals(999.0, $sale->fresh()->grand_total);
    }

    public function test_controller_keeps_a_successful_approval_response_when_customer_queue_scheduling_throws(): void
    {
        [$sale] = $this->pendingRevision('customer@example.test', 125);
        $this->approve($sale);
        $revision = $this->revisions->finalizeApproved($sale->fresh());
        $approved = $sale->fresh()->setRelation('approvedCustomerEmailRevision', $revision);
        $requestUser = $this->controllerUser();
        $request = Request::create("/api/sales-invoices/{$sale->id}/approve", 'POST');
        $request->setUserResolver(fn (): User => $requestUser);
        $approvals = Mockery::mock(ApprovalService::class);
        $approvals->shouldReceive('approveSale')->once()->with($sale, $requestUser)->andReturn($approved);
        $approvals->shouldReceive('canApprove')->andReturn(false);
        $this->app->instance(ApprovalService::class, $approvals);
        $notifications = Mockery::mock(RecordNotificationService::class);
        $notifications->shouldReceive('salesInvoiceApproved')->once()->with($approved);
        $notifications->shouldReceive('salesInvoiceApprovedForCustomer')
            ->once()
            ->with(Mockery::on(fn ($queued): bool => $queued instanceof SalesInvoiceRevision && $queued->is($revision)))
            ->andThrow(new RuntimeException('Database queue unavailable'));
        Log::spy();

        $response = (new SalesInvoiceController)->approve($sale, $request, $approvals, $notifications);

        $this->assertSame(200, $response->status());
        $this->assertSame('approved', $sale->fresh()->approval_status);
        Log::shouldHaveReceived('error')
            ->once()
            ->with('Approved sales invoice customer email scheduling failed.', [
                'sale_id' => $sale->id,
                'revision_id' => $revision->id,
                'recipient_email' => 'customer@example.test',
            ]);
    }

    public function test_controller_leaves_recovery_to_the_outbox_when_the_revision_handoff_is_missing(): void
    {
        [$sale] = $this->pendingRevision('customer@example.test', 125);
        $this->approve($sale);
        $approved = $sale->fresh();
        $requestUser = $this->controllerUser();
        $request = Request::create("/api/sales-invoices/{$sale->id}/approve", 'POST');
        $request->setUserResolver(fn (): User => $requestUser);
        $approvals = Mockery::mock(ApprovalService::class);
        $approvals->shouldReceive('approveSale')->once()->with($sale, $requestUser)->andReturn($approved);
        $approvals->shouldReceive('canApprove')->andReturn(false);
        $this->app->instance(ApprovalService::class, $approvals);
        $notifications = Mockery::mock(RecordNotificationService::class);
        $notifications->shouldReceive('salesInvoiceApproved')->once()->with($approved);
        $notifications->shouldNotReceive('salesInvoiceApprovedForCustomer');
        Log::spy();

        $response = (new SalesInvoiceController)->approve($sale, $request, $approvals, $notifications);

        $this->assertSame(200, $response->status());
        Log::shouldHaveReceived('error')
            ->once()
            ->with('Approved sales invoice customer email revision was not attached.', [
                'sale_id' => $sale->id,
            ]);
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
        $this->notifyApproved($sale);
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
        $this->notifyApproved($sale);
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
        $this->notifyApproved($sale);
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
        $this->notifyApproved($sale);
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
        $this->notifyApproved($sale);
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
        $this->notifyApproved($sale);
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

    private function setting(bool $emailEnabled, bool $smsEnabled = false, array $approverIds = []): GeneralSetting
    {
        return GeneralSetting::query()->create([
            'customer_sales_invoice_mail_notification_enabled' => $emailEnabled,
            'customer_sales_invoice_sms_notification_enabled' => $smsEnabled,
            'sales_invoice_approver_ids' => $approverIds,
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

    private function grantSalesApproval(User $user): void
    {
        $permissions = collect([
            'sales-index',
            SensitivePermissionCatalog::APPROVAL_SALES_INVOICE,
        ])->map(fn (string $name): Permission => Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]));

        $user->givePermissionTo($permissions);
    }

    private function notifyApproved(Sale $sale): SalesInvoiceRevision
    {
        $revision = $this->revisions->finalizeApproved($sale->fresh());
        $this->notifications->salesInvoiceApprovedForCustomer($revision);

        return $revision;
    }

    private function controllerUser(): User
    {
        $user = Mockery::mock(User::class)->makePartial();
        $user->forceFill(['id' => 999]);
        $user->shouldReceive('requireCurrentBillerId')->andReturn(0);

        return $user;
    }
}
