<?php

namespace App\Services {
    if (! class_exists(SalesInvoicePdfRenderer::class)) {
        class SalesInvoicePdfRenderer
        {
            public function render(array $snapshot): string
            {
                throw new \LogicException('The Task 5 PDF renderer is not installed.');
            }

            public function filename(array $snapshot): string
            {
                throw new \LogicException('The Task 5 PDF renderer is not installed.');
            }
        }
    }
}

namespace Tests\Feature {
    use App\Jobs\SendApprovedSalesInvoiceEmail;
    use App\Mail\ApprovedSalesInvoiceMail;
    use App\Models\EmailLog;
    use App\Models\SalesInvoiceRevision;
    use App\Services\SalesInvoicePdfRenderer;
    use Illuminate\Database\Schema\Blueprint;
    use Illuminate\Mail\Mailables\Attachment;
    use Illuminate\Support\Facades\Log;
    use Illuminate\Support\Facades\Mail;
    use Illuminate\Support\Facades\Schema;
    use Mockery;
    use Mockery\MockInterface;
    use RuntimeException;
    use Tests\TestCase;

    class ApprovedSalesInvoiceMailTest extends TestCase
    {
        protected function setUp(): void
        {
            parent::setUp();

            Schema::create('sales', function (Blueprint $table): void {
                $table->increments('id');
                $table->string('reference_no');
                $table->timestamps();
            });

            $revisionMigration = require database_path('migrations/2026_08_30_000002_create_sales_invoice_revisions_table.php');
            $revisionMigration->up();

            $emailLogMigration = require database_path('migrations/2026_07_04_000005_create_email_logs_table.php');
            $emailLogMigration->up();
        }

        protected function tearDown(): void
        {
            Schema::dropIfExists('email_logs');
            Schema::dropIfExists('sales_invoice_revisions');
            Schema::dropIfExists('sales');

            parent::tearDown();
        }

        public function test_created_mail_renders_the_complete_customer_safe_invoice_and_pdf_attachment(): void
        {
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED);
            $mail = new ApprovedSalesInvoiceMail(
                $revision,
                '%PDF-test',
                'sales-invoice-SR-2026-1042.pdf',
            );

            $this->assertSame('emails.sales-invoice-approved', $mail->content()->view);
            $mail->assertHasSubject('Sales Invoice Approved: SR-2026-1042');

            $html = $mail->render();

            $this->assertStringContainsString('A &amp; B Mart', $html);
            $this->assertStringContainsString('SR-2026-1042', $html);
            $this->assertStringContainsString('Green Tea', $html);
            $this->assertStringContainsString('GT-01', $html);
            $this->assertStringContainsString('Rice', $html);
            $this->assertStringContainsString('1.25', $html);
            $this->assertStringContainsString('BDT 125.50', $html);
            $this->assertStringContainsString('BDT 251.00', $html);
            $this->assertStringContainsString('7.50%', $html);
            $this->assertStringContainsString('BDT 346.50', $html);
            $this->assertStringNotContainsString('Revision changes', $html);
            $this->assertStringNotContainsString('REMOVED', $html);
            $this->assertCustomerSafe($html);

            $attachments = $mail->attachments();

            $this->assertCount(1, $attachments);
            $this->assertInstanceOf(Attachment::class, $attachments[0]);
            $mail->assertHasAttachment(
                Attachment::fromData(fn (): string => '%PDF-test')
                    ->as('sales-invoice-SR-2026-1042.pdf')
                    ->withMime('application/pdf')
            );
        }

        public function test_updated_mail_renders_the_full_current_table_and_customer_visible_revision_rows(): void
        {
            $revision = $this->revision(SalesInvoiceRevision::KIND_UPDATED);
            $mail = new ApprovedSalesInvoiceMail(
                $revision,
                '%PDF-test',
                'sales-invoice-SR-2026-1042.pdf',
            );

            $mail->assertHasSubject('Updated Sales Invoice Approved: SR-2026-1042');

            $html = $mail->render();

            $this->assertStringContainsString('Current approved products', $html);
            $this->assertStringContainsString('Green Tea', $html);
            $this->assertStringContainsString('Coffee', $html);
            $this->assertStringContainsString('Revision changes', $html);
            $this->assertStringContainsString('REMOVED', $html);
            $this->assertStringContainsString('ADDED', $html);
            $this->assertStringContainsString('CHANGED', $html);
            $this->assertStringContainsString('background:#fde8e8', $html);
            $this->assertStringContainsString('text-decoration:line-through', $html);
            $this->assertStringContainsString('background:#e4f6e9', $html);
            $this->assertStringContainsString('background:#fff5d9', $html);
            $this->assertStringContainsString('2 → 3', $html);
            $this->assertStringContainsString('BDT 125.50 → BDT 135.00', $html);
            $this->assertStringNotContainsString('pcs → pcs', $html);
            $this->assertStringContainsString('BDT 346.50 → BDT 495.00', $html);
            $this->assertCustomerSafe($html);
        }

        public function test_mail_uses_a_deterministic_message_id_for_the_immutable_revision(): void
        {
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED);

            $first = new ApprovedSalesInvoiceMail($revision, '%PDF-first', 'first.pdf');
            $retry = new ApprovedSalesInvoiceMail($revision->fresh(), '%PDF-retry', 'retry.pdf');

            $this->assertSame(
                "sales-invoice-revision-{$revision->id}@inventory.local",
                $first->headers()->messageId,
            );
            $this->assertSame($first->headers()->messageId, $retry->headers()->messageId);
        }

        public function test_job_sends_the_real_mailable_synchronously_and_records_success(): void
        {
            Mail::fake();
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED, [
                'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
                'failure_message' => 'previous attempt failed',
            ]);
            $renderer = $this->mockRenderer($revision);

            (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);

            Mail::assertSent(ApprovedSalesInvoiceMail::class, function (ApprovedSalesInvoiceMail $mail) use ($revision): bool {
                return $mail->revision->is($revision)
                    && $mail->pdfBytes === '%PDF-test'
                    && $mail->pdfFilename === 'sales-invoice-SR-2026-1042.pdf'
                    && $mail->hasTo('customer@example.test')
                    && $mail->hasSubject('Sales Invoice Approved: SR-2026-1042');
            });
            Mail::assertNothingQueued();

            $fresh = $revision->fresh();
            $this->assertSame(SalesInvoiceRevision::STATUS_SENT, $fresh->delivery_status);
            $this->assertNotNull($fresh->sent_at);
            $this->assertNull($fresh->failure_message);

            $log = EmailLog::query()->sole();
            $this->assertSame('customer@example.test', $log->email);
            $this->assertSame('Sales Invoice Approved: SR-2026-1042', $log->subject);
            $this->assertSame('Approved sales invoice SR-2026-1042 emailed to customer@example.test.', $log->message);
            $this->assertSame('submitted', $log->status);
            $this->assertSame(config('mail.default'), $log->provider);
            $this->assertSame('customer_sales_invoice', $log->record_type);
            $this->assertSame($revision->sale_id, $log->record_id);
            $this->assertCustomerSafe((string) json_encode($log->getAttributes()));
        }

        public function test_job_records_safe_failure_context_and_rethrows_for_queue_retry(): void
        {
            $revision = $this->revision(SalesInvoiceRevision::KIND_UPDATED, [
                'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
            ]);
            $renderer = $this->mockRenderer($revision);
            $exception = new RuntimeException('SMTP exposed unit_cost 71, total_cost 99 and profit 28');
            $mailer = Mockery::mock();
            $mailer->shouldReceive('send')
                ->once()
                ->with(Mockery::type(ApprovedSalesInvoiceMail::class))
                ->andThrow($exception);
            Mail::shouldReceive('to')
                ->once()
                ->with('customer@example.test')
                ->andReturn($mailer);
            Log::spy();

            try {
                (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);
                $this->fail('The delivery exception was not rethrown.');
            } catch (RuntimeException $caught) {
                $this->assertSame($exception, $caught);
            }

            $fresh = $revision->fresh();
            $this->assertSame(SalesInvoiceRevision::STATUS_FAILED, $fresh->delivery_status);
            $this->assertSame($exception->getMessage(), $fresh->failure_message);

            $log = EmailLog::query()->sole();
            $this->assertSame('error', $log->status);
            $this->assertSame('Delivery failed; retry scheduled.', $log->provider_response);
            $this->assertSame('customer_sales_invoice', $log->record_type);
            $this->assertSame($revision->sale_id, $log->record_id);
            $this->assertCustomerSafe((string) json_encode($log->getAttributes()));

            Log::shouldHaveReceived('error')
                ->once()
                ->with('Approved sales invoice customer email failed.', Mockery::on(function (array $context) use ($revision): bool {
                    return $context === [
                        'sale_id' => $revision->sale_id,
                        'revision_id' => $revision->id,
                        'recipient_email' => 'customer@example.test',
                    ];
                }));
        }

        public function test_job_exits_before_rendering_or_sending_a_revision_already_marked_sent(): void
        {
            Mail::fake();
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED, [
                'delivery_status' => SalesInvoiceRevision::STATUS_SENT,
                'sent_at' => now(),
            ]);
            $renderer = $this->mock(SalesInvoicePdfRenderer::class, function (MockInterface $mock): void {
                $mock->shouldNotReceive('render');
                $mock->shouldNotReceive('filename');
            });

            (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);

            Mail::assertNothingSent();
            $this->assertSame(0, EmailLog::query()->count());
        }

        public function test_job_exits_before_rendering_or_sending_a_revision_marked_skipped(): void
        {
            Mail::fake();
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED, [
                'delivery_status' => SalesInvoiceRevision::STATUS_SKIPPED,
            ]);
            $renderer = $this->mock(SalesInvoicePdfRenderer::class, function (MockInterface $mock): void {
                $mock->shouldNotReceive('render');
                $mock->shouldNotReceive('filename');
            });

            (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);

            Mail::assertNothingSent();
            $this->assertSame(0, EmailLog::query()->count());
        }

        public function test_retry_after_smtp_acceptance_before_sent_status_can_repeat_the_same_message_id(): void
        {
            Mail::fake();
            $revision = $this->revision(SalesInvoiceRevision::KIND_CREATED, [
                'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
            ]);
            $renderer = $this->mockRenderer($revision, 2);
            Schema::getConnection()->unprepared(<<<'SQL'
                CREATE TRIGGER fail_sales_invoice_revision_sent
                BEFORE UPDATE OF delivery_status ON sales_invoice_revisions
                WHEN NEW.delivery_status = 'sent'
                BEGIN
                    SELECT RAISE(FAIL, 'simulated crash after SMTP acceptance');
                END
                SQL);

            try {
                (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);
                $this->fail('The simulated post-acceptance status failure was not raised.');
            } catch (\Throwable) {
                // SMTP has already accepted the first message, while durable sent state was not recorded.
            }

            Mail::assertSentCount(1);
            $this->assertSame(SalesInvoiceRevision::STATUS_FAILED, $revision->fresh()->delivery_status);

            Schema::getConnection()->unprepared('DROP TRIGGER fail_sales_invoice_revision_sent');
            (new SendApprovedSalesInvoiceEmail($revision->id))->handle($renderer);

            Mail::assertSentCount(2);
            $messageIds = [];
            Mail::assertSent(ApprovedSalesInvoiceMail::class, function (ApprovedSalesInvoiceMail $mail) use (&$messageIds): bool {
                $messageIds[] = $mail->headers()->messageId;

                return true;
            });
            $this->assertSame([
                "sales-invoice-revision-{$revision->id}@inventory.local",
                "sales-invoice-revision-{$revision->id}@inventory.local",
            ], $messageIds);
            $this->assertSame(SalesInvoiceRevision::STATUS_SENT, $revision->fresh()->delivery_status);
        }

        private function revision(string $kind, array $attributes = []): SalesInvoiceRevision
        {
            $saleId = Schema::getConnection()->table('sales')->insertGetId([
                'reference_no' => 'SR-2026-1042',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $created = $this->createdSnapshot();
            $updated = $this->updatedSnapshot();

            return SalesInvoiceRevision::query()->create([
                'sale_id' => $saleId,
                'revision_number' => 1,
                'kind' => $kind,
                'before_snapshot' => $kind === SalesInvoiceRevision::KIND_UPDATED ? $created : null,
                'after_snapshot' => $kind === SalesInvoiceRevision::KIND_UPDATED ? $updated : $created,
                'changes' => $kind === SalesInvoiceRevision::KIND_UPDATED ? $this->changes() : null,
                'recipient_email' => 'customer@example.test',
                'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
                ...$attributes,
            ]);
        }

        private function mockRenderer(SalesInvoiceRevision $revision, int $times = 1): SalesInvoicePdfRenderer
        {
            return $this->mock(SalesInvoicePdfRenderer::class, function (MockInterface $mock) use ($revision, $times): void {
                $mock->shouldReceive('render')
                    ->times($times)
                    ->with($revision->after_snapshot)
                    ->andReturn('%PDF-test');
                $mock->shouldReceive('filename')
                    ->times($times)
                    ->with($revision->after_snapshot)
                    ->andReturn('sales-invoice-SR-2026-1042.pdf');
            });
        }

        private function createdSnapshot(): array
        {
            return [
                'schema_version' => 1,
                'invoice' => [
                    'reference_no' => 'SR-2026-1042',
                    'sale_date' => '2026-08-30',
                    'approval_status' => 'approved',
                    'grand_total' => 346.50,
                    'profit' => 120.00,
                ],
                'company' => [
                    'name' => 'Inventory Green',
                    'email' => 'hello@example.test',
                    'phone_number' => '+8801700000000',
                    'address' => 'Dhaka',
                ],
                'customer' => [
                    'name' => 'A & B Mart',
                    'email' => 'customer@example.test',
                ],
                'lines' => [
                    [
                        'key' => '1:null:null:1:1',
                        'product_name' => 'Green Tea',
                        'product_code' => 'GT-01',
                        'variant' => 'Large',
                        'batch' => 'B-10',
                        'qty' => 2.0,
                        'unit' => 'pcs',
                        'unit_price' => 125.50,
                        'discount' => 0.0,
                        'tax_rate' => 7.5,
                        'tax' => 0.0,
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
                        'discount' => 5.0,
                        'tax_rate' => 0.0,
                        'tax' => 0.0,
                        'total' => 95.50,
                    ],
                ],
            ];
        }

        private function updatedSnapshot(): array
        {
            $snapshot = $this->createdSnapshot();
            $snapshot['invoice']['grand_total'] = 495.0;
            $snapshot['lines'] = [
                [
                    ...$snapshot['lines'][0],
                    'qty' => 3.0,
                    'unit_price' => 135.0,
                    'total' => 405.0,
                ],
                [
                    'key' => '3:null:null:1:1',
                    'product_name' => 'Coffee',
                    'product_code' => 'CF-03',
                    'variant' => null,
                    'batch' => null,
                    'qty' => 1.0,
                    'unit' => 'pcs',
                    'unit_price' => 90.0,
                    'discount' => 0.0,
                    'tax_rate' => 0.0,
                    'tax' => 0.0,
                    'total' => 90.0,
                ],
            ];

            return $snapshot;
        }

        private function changes(): array
        {
            $before = $this->createdSnapshot();
            $after = $this->updatedSnapshot();

            return [
                'added_lines' => [$after['lines'][1]],
                'removed_lines' => [$before['lines'][1]],
                'modified_lines' => [[
                    'key' => $after['lines'][0]['key'],
                    'before' => $before['lines'][0],
                    'after' => $after['lines'][0],
                    'fields' => [
                        'qty' => ['before' => 2.0, 'after' => 3.0],
                        'unit_price' => ['before' => 125.50, 'after' => 135.0],
                        'total' => ['before' => 251.0, 'after' => 405.0],
                    ],
                ]],
                'changed_totals' => [
                    'grand_total' => ['before' => 346.50, 'after' => 495.0],
                ],
            ];
        }

        private function assertCustomerSafe(string $content): void
        {
            foreach (['Cost Price', 'Total Cost', 'Profit', 'unit_cost', 'total_cost'] as $sensitiveTerm) {
                $this->assertStringNotContainsStringIgnoringCase($sensitiveTerm, $content);
            }
        }
    }
}
