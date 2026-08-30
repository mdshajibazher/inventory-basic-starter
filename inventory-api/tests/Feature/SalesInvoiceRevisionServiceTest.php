<?php

namespace Tests\Feature;

use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use App\Services\SalesInvoiceRevisionService;
use App\Services\SalesInvoiceSnapshotService;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SalesInvoiceRevisionServiceTest extends TestCase
{
    private SalesInvoiceRevisionService $revisions;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('sales', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_no');
            $table->decimal('grand_total', 15, 2)->default(0);
            $table->string('approval_status', 16)->default('pending');
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        $migration = require database_path('migrations/2026_08_30_000002_create_sales_invoice_revisions_table.php');
        $migration->up();

        DB::statement('PRAGMA foreign_keys = ON');

        $snapshots = new class extends SalesInvoiceSnapshotService
        {
            public function snapshot(Sale $sale): array
            {
                return [
                    'schema_version' => 1,
                    'invoice' => [
                        'reference_no' => $sale->reference_no,
                        'grand_total' => round((float) $sale->grand_total, 2),
                    ],
                    'customer' => ['email' => 'customer@example.test'],
                    'lines' => [],
                ];
            }
        };

        $this->revisions = new SalesInvoiceRevisionService($snapshots);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('sales_invoice_revisions');
        Schema::dropIfExists('sales');

        parent::tearDown();
    }

    public function test_migration_creates_the_revision_schema_and_model_casts_values(): void
    {
        $this->assertSame([
            'id',
            'sale_id',
            'revision_number',
            'kind',
            'before_snapshot',
            'after_snapshot',
            'changes',
            'recipient_email',
            'delivery_status',
            'approved_at',
            'queued_at',
            'sent_at',
            'failure_message',
            'created_at',
            'updated_at',
        ], Schema::getColumnListing('sales_invoice_revisions'));

        $sale = $this->sale();
        $revision = SalesInvoiceRevision::query()->create([
            'sale_id' => $sale->id,
            'revision_number' => 1,
            'kind' => SalesInvoiceRevision::KIND_CREATED,
            'before_snapshot' => ['invoice' => ['grand_total' => 90.0]],
            'after_snapshot' => ['invoice' => ['grand_total' => 100.0]],
            'changes' => ['changed_totals' => ['grand_total' => ['before' => 90.0, 'after' => 100.0]]],
            'recipient_email' => 'customer@example.test',
            'approved_at' => '2026-08-30 10:00:00',
            'queued_at' => '2026-08-30 10:01:00',
            'sent_at' => '2026-08-30 10:02:00',
        ])->fresh();

        $this->assertEquals(['invoice' => ['grand_total' => 90.0]], $revision->before_snapshot);
        $this->assertEquals(['invoice' => ['grand_total' => 100.0]], $revision->after_snapshot);
        $this->assertEquals(['changed_totals' => ['grand_total' => ['before' => 90.0, 'after' => 100.0]]], $revision->changes);
        $this->assertInstanceOf(Carbon::class, $revision->approved_at);
        $this->assertInstanceOf(Carbon::class, $revision->queued_at);
        $this->assertInstanceOf(Carbon::class, $revision->sent_at);
        $this->assertSame(SalesInvoiceRevision::STATUS_PENDING, $revision->delivery_status);
        $this->assertTrue($sale->customerEmailRevisions->contains($revision));
    }

    public function test_revision_number_is_unique_within_each_sale(): void
    {
        $sale = $this->sale();
        $attributes = [
            'sale_id' => $sale->id,
            'revision_number' => 1,
            'kind' => SalesInvoiceRevision::KIND_CREATED,
            'after_snapshot' => ['invoice' => ['grand_total' => 100.0]],
        ];

        SalesInvoiceRevision::query()->create($attributes);
        SalesInvoiceRevision::query()->create([
            ...$attributes,
            'sale_id' => $this->sale()->id,
        ]);

        $this->assertSame(2, SalesInvoiceRevision::query()->count());

        $this->expectException(QueryException::class);
        SalesInvoiceRevision::query()->create($attributes);
    }

    public function test_deleting_a_sale_cascades_its_revisions(): void
    {
        $sale = $this->sale();
        SalesInvoiceRevision::query()->create([
            'sale_id' => $sale->id,
            'revision_number' => 1,
            'kind' => SalesInvoiceRevision::KIND_CREATED,
            'after_snapshot' => ['invoice' => ['grand_total' => 100.0]],
        ]);

        $sale->delete();

        $this->assertSame(0, SalesInvoiceRevision::query()->count());
    }

    public function test_new_pending_sale_gets_created_revision_one_with_the_current_snapshot(): void
    {
        $sale = $this->sale(grandTotal: 100);

        $revision = $this->revisions->syncPending($sale);

        $this->assertSame(1, $revision->revision_number);
        $this->assertSame(SalesInvoiceRevision::KIND_CREATED, $revision->kind);
        $this->assertNull($revision->before_snapshot);
        $this->assertEquals(100.0, $revision->after_snapshot['invoice']['grand_total']);
        $this->assertNull($revision->changes);
        $this->assertSame('customer@example.test', $revision->recipient_email);
        $this->assertSame(SalesInvoiceRevision::STATUS_PENDING, $revision->delivery_status);
    }

    public function test_reediting_before_first_approval_updates_revision_one(): void
    {
        $sale = $this->sale(grandTotal: 100);
        $first = $this->revisions->syncPending($sale);

        $sale->update(['grand_total' => 125]);
        $refreshed = $this->revisions->syncPending($sale->fresh());

        $this->assertSame($first->id, $refreshed->id);
        $this->assertSame(1, SalesInvoiceRevision::query()->count());
        $this->assertNull($refreshed->before_snapshot);
        $this->assertEquals(125.0, $refreshed->after_snapshot['invoice']['grand_total']);
        $this->assertNull($refreshed->changes);
    }

    public function test_edit_after_approval_creates_revision_two_from_the_finalized_snapshot(): void
    {
        $sale = $this->sale(grandTotal: 100);
        $first = $this->revisions->syncPending($sale);
        $first->update(['approved_at' => now()]);

        $sale->update(['grand_total' => 140]);
        $second = $this->revisions->syncPending($sale->fresh());

        $this->assertSame(2, $second->revision_number);
        $this->assertSame(SalesInvoiceRevision::KIND_UPDATED, $second->kind);
        $this->assertSame($first->after_snapshot, $second->before_snapshot);
        $this->assertEquals(140.0, $second->after_snapshot['invoice']['grand_total']);
        $this->assertEquals([
            'before' => 100.0,
            'after' => 140.0,
        ], $second->changes['changed_totals']['grand_total']);
    }

    public function test_second_pending_edit_keeps_revision_two_baseline_immutable(): void
    {
        $sale = $this->sale(grandTotal: 100);
        $first = $this->revisions->syncPending($sale);
        $first->update(['approved_at' => now()]);

        $sale->update(['grand_total' => 140]);
        $second = $this->revisions->syncPending($sale->fresh());
        $baseline = $second->before_snapshot;

        $sale->update(['grand_total' => 165]);
        $refreshed = $this->revisions->syncPending($sale->fresh());

        $this->assertSame($second->id, $refreshed->id);
        $this->assertSame(2, SalesInvoiceRevision::query()->count());
        $this->assertSame($baseline, $refreshed->before_snapshot);
        $this->assertEquals(165.0, $refreshed->after_snapshot['invoice']['grand_total']);
        $this->assertEquals([
            'before' => 100.0,
            'after' => 165.0,
        ], $refreshed->changes['changed_totals']['grand_total']);
    }

    public function test_sync_keeps_only_the_latest_unapproved_revision(): void
    {
        $sale = $this->sale(grandTotal: 175);
        $first = $this->revision($sale, 1, approved: true);
        $olderPending = $this->revision($sale, 2);
        $latestPending = $this->revision($sale, 3);

        $refreshed = $this->revisions->syncPending($sale);

        $this->assertSame($latestPending->id, $refreshed->id);
        $this->assertDatabaseMissing('sales_invoice_revisions', ['id' => $olderPending->id]);
        $this->assertDatabaseHas('sales_invoice_revisions', ['id' => $first->id]);
        $this->assertSame(2, SalesInvoiceRevision::query()->count());
    }

    public function test_begin_update_preserves_an_approved_legacy_sale_before_mutation(): void
    {
        $sale = $this->sale(grandTotal: 100, approved: true);

        $this->revisions->beginUpdate($sale);

        $seeded = SalesInvoiceRevision::query()->sole();
        $this->assertSame(1, $seeded->revision_number);
        $this->assertSame(SalesInvoiceRevision::KIND_UPDATED, $seeded->kind);
        $this->assertEquals(100.0, $seeded->before_snapshot['invoice']['grand_total']);
        $this->assertSame($seeded->before_snapshot, $seeded->after_snapshot);

        $sale->update([
            'grand_total' => 175,
            'approval_status' => 'pending',
            'approved_at' => null,
        ]);
        $refreshed = $this->revisions->syncPending($sale->fresh());

        $this->assertSame($seeded->id, $refreshed->id);
        $this->assertSame(1, SalesInvoiceRevision::query()->count());
        $this->assertEquals(100.0, $refreshed->before_snapshot['invoice']['grand_total']);
        $this->assertEquals(175.0, $refreshed->after_snapshot['invoice']['grand_total']);
        $this->assertEquals([
            'before' => 100.0,
            'after' => 175.0,
        ], $refreshed->changes['changed_totals']['grand_total']);
    }

    public function test_begin_update_does_nothing_for_a_never_approved_sale(): void
    {
        $this->revisions->beginUpdate($this->sale());

        $this->assertSame(0, SalesInvoiceRevision::query()->count());
    }

    private function sale(float $grandTotal = 100, bool $approved = false): Sale
    {
        return Sale::query()->create([
            'reference_no' => 'SI-2026-00001',
            'grand_total' => $grandTotal,
            'approval_status' => $approved ? 'approved' : 'pending',
            'approved_at' => $approved ? now() : null,
        ]);
    }

    private function revision(Sale $sale, int $number, bool $approved = false): SalesInvoiceRevision
    {
        return SalesInvoiceRevision::query()->create([
            'sale_id' => $sale->id,
            'revision_number' => $number,
            'kind' => $number === 1 ? SalesInvoiceRevision::KIND_CREATED : SalesInvoiceRevision::KIND_UPDATED,
            'before_snapshot' => $number === 1 ? null : ['invoice' => ['grand_total' => 100]],
            'after_snapshot' => ['invoice' => ['grand_total' => 125 + $number]],
            'approved_at' => $approved ? now() : null,
        ]);
    }
}
