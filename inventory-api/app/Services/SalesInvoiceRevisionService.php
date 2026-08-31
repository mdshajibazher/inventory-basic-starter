<?php

namespace App\Services;

use App\Jobs\SendApprovedSalesInvoiceEmail;
use App\Models\GeneralSetting;
use App\Models\Sale;
use App\Models\SalesInvoiceRevision;
use Carbon\CarbonInterface;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use LogicException;
use Throwable;

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

    public function finalizeApproved(Sale $sale): SalesInvoiceRevision
    {
        return DB::transaction(function () use ($sale): SalesInvoiceRevision {
            $lockedSale = Sale::query()->lockForUpdate()->findOrFail($sale->id);

            if ($lockedSale->approval_status !== ApprovalService::APPROVED) {
                throw new LogicException('Sales invoice must be approved before finalization.');
            }

            $revisions = $this->lockedRevisions($lockedSale);
            $pending = $this->onlyPendingRevision($revisions);

            if ($pending === null) {
                $finalized = $revisions
                    ->whereNotNull('approved_at')
                    ->sortByDesc(fn (SalesInvoiceRevision $revision): string => sprintf(
                        '%s:%010d',
                        $revision->approved_at->format('Y-m-d H:i:s.u'),
                        $revision->revision_number,
                    ))
                    ->first();

                if ($finalized === null) {
                    $after = $this->snapshots->snapshot($lockedSale->fresh());
                    $recipient = data_get($after, 'customer.email');

                    return $lockedSale->customerEmailRevisions()->create([
                        'revision_number' => 1,
                        'kind' => SalesInvoiceRevision::KIND_CREATED,
                        'before_snapshot' => null,
                        'after_snapshot' => $after,
                        'changes' => null,
                        'recipient_email' => is_string($recipient) ? trim($recipient) : null,
                        'approved_at' => $lockedSale->approved_at ?? now(),
                        'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
                    ]);
                }

                return $finalized;
            }

            $after = $this->snapshots->snapshot($lockedSale->fresh());
            $recipient = data_get($after, 'customer.email');

            $pending->update([
                'after_snapshot' => $after,
                'changes' => $pending->before_snapshot === null
                    ? null
                    : $this->snapshots->diff($pending->before_snapshot, $after),
                'recipient_email' => is_string($recipient) ? trim($recipient) : null,
                'approved_at' => $lockedSale->approved_at ?? now(),
                'failure_message' => null,
            ]);

            return $pending->fresh();
        });
    }

    public function queueCustomerDelivery(SalesInvoiceRevision $revision): void
    {
        $setting = GeneralSetting::query()->latest('id')->first();

        if (blank($revision->recipient_email)) {
            SalesInvoiceRevision::query()
                ->whereKey($revision->id)
                ->where('delivery_status', SalesInvoiceRevision::STATUS_PENDING)
                ->update([
                    'delivery_status' => SalesInvoiceRevision::STATUS_SKIPPED,
                    'failure_message' => 'Customer email missing.',
                ]);

            return;
        }

        if (! $setting?->customer_sales_invoice_mail_notification_enabled) {
            SalesInvoiceRevision::query()
                ->whereKey($revision->id)
                ->where('delivery_status', SalesInvoiceRevision::STATUS_PENDING)
                ->update([
                    'delivery_status' => SalesInvoiceRevision::STATUS_SKIPPED,
                    'failure_message' => 'Customer sales invoice email disabled.',
                ]);

            return;
        }

        $updated = SalesInvoiceRevision::query()
            ->whereKey($revision->id)
            ->where('delivery_status', SalesInvoiceRevision::STATUS_PENDING)
            ->update([
                'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
                'queued_at' => now(),
                'failure_message' => null,
            ]);

        if ($updated === 1) {
            try {
                $dispatch = SendApprovedSalesInvoiceEmail::dispatch($revision->id)->afterCommit();
                unset($dispatch);
            } catch (Throwable) {
                (new UniqueLock(app(Cache::class)))
                    ->release(new SendApprovedSalesInvoiceEmail($revision->id));

                SalesInvoiceRevision::query()
                    ->whereKey($revision->id)
                    ->where('delivery_status', SalesInvoiceRevision::STATUS_QUEUED)
                    ->update([
                        'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
                        'queued_at' => null,
                        'failure_message' => 'Queue dispatch failed; recovery will retry.',
                    ]);

                Log::error('Approved sales invoice email queue dispatch failed.', [
                    'sale_id' => $revision->sale_id,
                    'revision_id' => $revision->id,
                    'recipient_email' => $revision->recipient_email,
                ]);
            }
        }
    }

    public function recoverDeliveries(?CarbonInterface $now = null): int
    {
        $now ??= now();
        $staleBefore = $now->copy()->subSeconds(SendApprovedSalesInvoiceEmail::LEASE_SECONDS);
        $candidateIds = SalesInvoiceRevision::query()
            ->whereNotNull('approved_at')
            ->where(function ($query) use ($staleBefore): void {
                $query->where('delivery_status', SalesInvoiceRevision::STATUS_PENDING)
                    ->orWhere(function ($queued) use ($staleBefore): void {
                        $queued->where('delivery_status', SalesInvoiceRevision::STATUS_QUEUED)
                            ->where(function ($lease) use ($staleBefore): void {
                                $lease->whereNull('queued_at')->orWhere('queued_at', '<=', $staleBefore);
                            });
                    });
            })
            ->orderBy('id')
            ->pluck('id');

        $recovered = 0;

        foreach ($candidateIds as $candidateId) {
            $revision = DB::transaction(function () use ($candidateId, $staleBefore): ?SalesInvoiceRevision {
                $locked = SalesInvoiceRevision::query()->lockForUpdate()->find($candidateId);

                if ($locked === null || $locked->approved_at === null) {
                    return null;
                }

                if ($locked->delivery_status === SalesInvoiceRevision::STATUS_PENDING) {
                    return $locked;
                }

                if ($locked->delivery_status !== SalesInvoiceRevision::STATUS_QUEUED
                    || ($locked->queued_at !== null && $locked->queued_at->isAfter($staleBefore))) {
                    return null;
                }

                $locked->forceFill([
                    'delivery_status' => SalesInvoiceRevision::STATUS_PENDING,
                    'queued_at' => null,
                    'failure_message' => 'Stale queue lease recovered.',
                ])->save();

                return $locked->fresh();
            });

            if ($revision === null) {
                continue;
            }

            $recovered++;
            $this->queueCustomerDelivery($revision);
        }

        return $recovered;
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
