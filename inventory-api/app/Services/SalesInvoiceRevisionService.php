<?php

namespace App\Services;

use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class SalesInvoiceRevisionService
{
    public function __construct(private readonly SalesInvoiceSnapshotService $snapshots) {}

    public function beginUpdate(Sale $sale): void
    {
        DB::transaction(function () use ($sale): void {
            $lockedSale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            $revisions = $this->lockedRevisions($lockedSale);

            if ($lockedSale->approved_at === null || $revisions->isNotEmpty()) {
                return;
            }

            $snapshot = $this->snapshots->snapshot($lockedSale->fresh());

            $lockedSale->customerEmailRevisions()->create([
                'revision_number' => 1,
                'kind' => SalesInvoiceRevision::KIND_UPDATED,
                'before_snapshot' => $snapshot,
                'after_snapshot' => $snapshot,
                'changes' => $this->snapshots->diff($snapshot, $snapshot),
                'recipient_email' => data_get($snapshot, 'customer.email'),
                'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
            ]);
        });
    }

    public function syncPending(Sale $sale): SalesInvoiceRevision
    {
        return DB::transaction(function () use ($sale): SalesInvoiceRevision {
            $lockedSale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            $revisions = $this->lockedRevisions($lockedSale);
            $pending = $this->onlyPendingRevision($revisions);
            $after = $this->snapshots->snapshot($lockedSale->fresh());

            if ($pending !== null) {
                $pending->update([
                    'after_snapshot' => $after,
                    'changes' => $pending->before_snapshot === null
                        ? null
                        : $this->snapshots->diff($pending->before_snapshot, $after),
                    'recipient_email' => data_get($after, 'customer.email'),
                ]);

                return $pending->fresh();
            }

            $finalized = $revisions
                ->whereNotNull('approved_at')
                ->sortByDesc(fn (SalesInvoiceRevision $revision): string => sprintf(
                    '%s:%010d',
                    $revision->approved_at->format('Y-m-d H:i:s.u'),
                    $revision->revision_number,
                ))
                ->first();
            $before = $finalized?->after_snapshot;

            return $lockedSale->customerEmailRevisions()->create([
                'revision_number' => ((int) $revisions->max('revision_number')) + 1,
                'kind' => $before === null
                    ? SalesInvoiceRevision::KIND_CREATED
                    : SalesInvoiceRevision::KIND_UPDATED,
                'before_snapshot' => $before,
                'after_snapshot' => $after,
                'changes' => $before === null ? null : $this->snapshots->diff($before, $after),
                'recipient_email' => data_get($after, 'customer.email'),
                'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
            ]);
        });
    }

    /** @return Collection<int, SalesInvoiceRevision> */
    private function lockedRevisions(Sale $sale): Collection
    {
        return $sale->customerEmailRevisions()
            ->lockForUpdate()
            ->orderBy('revision_number')
            ->get();
    }

    private function onlyPendingRevision(Collection $revisions): ?SalesInvoiceRevision
    {
        $pending = $revisions->whereNull('approved_at');
        $latest = $pending->last();

        if ($pending->count() > 1) {
            SalesInvoiceRevision::query()
                ->whereKey($pending->except($latest->getKey())->modelKeys())
                ->delete();
        }

        return $latest;
    }
}
