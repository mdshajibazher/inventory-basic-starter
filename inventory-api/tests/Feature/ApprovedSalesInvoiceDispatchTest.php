<?php

namespace Tests\Feature;

use App\Jobs\SendApprovedSalesInvoiceEmail;
use App\Models\Customer;
use App\Models\GeneralSetting;
use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use App\Models\User;
use App\Services\RecordNotificationService;
use App\Services\SalesInvoiceRevisionService;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
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
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('password')->nullable();
            $table->timestamps();
        });
        Schema::create('sales', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_no');
            $table->foreignId('customer_id')->nullable();
            $table->foreignId('user_id')->nullable();
            $table->decimal('grand_total', 15, 2)->default(0);
            $table->string('approval_status', 16)->default('pending');
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
        Schema::create('general_settings', function (Blueprint $table): void {
            $table->id();
            $table->boolean('customer_sales_invoice_mail_notification_enabled')->default(false);
            $table->boolean('customer_sales_invoice_sms_notification_enabled')->default(false);
            $table->string('bulksmsbd_api_url')->nullable();
            $table->string('bulksmsbd_api_key')->nullable();
            $table->string('bulksmsbd_sender_id')->nullable();
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

        $snapshots = new class extends SalesInvoiceSnapshotService
        {
            public function snapshot(Sale $sale): array
            {
                $sale->loadMissing('customer:id,name,email,phone_number');

                return [
                    'schema_version' => 1,
                    'invoice' => [
                        'reference_no' => $sale->reference_no,
                        'grand_total' => round((float) $sale->grand_total, 2),
                        'approval_status' => $sale->approval_status,
                    ],
                    'customer' => [
                        'name' => $sale->customer?->name,
                        'email' => $sale->customer?->email,
                        'phone_number' => $sale->customer?->phone_number,
                    ],
                    'lines' => [],
                ];
            }
        };

        $this->revisions = new SalesInvoiceRevisionService($snapshots);
        $this->notifications = new RecordNotificationService($this->revisions);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('sales_invoice_revisions');
        Schema::dropIfExists('sms_logs');
        Schema::dropIfExists('general_settings');
        Schema::dropIfExists('sales');
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

    /** @return array{Sale, SalesInvoiceRevision} */
    private function pendingRevision(?string $email, float $grandTotal = 100): array
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
            'approval_status' => 'pending',
        ]);

        return [$sale, $this->revisions->syncPending($sale)];
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
