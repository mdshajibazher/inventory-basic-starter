<?php

namespace App\Jobs;

use App\Mail\ApprovedSalesInvoiceMail;
use App\Models\EmailLog;
use App\Models\SalesInvoiceRevision;
use App\Services\SalesInvoicePdfRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

class SendApprovedSalesInvoiceEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $revisionId) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(SalesInvoicePdfRenderer $renderer): void
    {
        $revision = SalesInvoiceRevision::query()->findOrFail($this->revisionId);

        if (in_array($revision->delivery_status, [
            SalesInvoiceRevision::STATUS_SENT,
            SalesInvoiceRevision::STATUS_SKIPPED,
        ], true)) {
            return;
        }

        try {
            $pdfBytes = $renderer->render($revision->after_snapshot);
            $filename = $renderer->filename($revision->after_snapshot);

            Mail::to($revision->recipient_email)->send(
                new ApprovedSalesInvoiceMail($revision, $pdfBytes, $filename)
            );

            $updated = SalesInvoiceRevision::query()
                ->whereKey($revision->id)
                ->whereNotIn('delivery_status', [
                    SalesInvoiceRevision::STATUS_SENT,
                    SalesInvoiceRevision::STATUS_SKIPPED,
                ])
                ->update([
                    'delivery_status' => SalesInvoiceRevision::STATUS_SENT,
                    'sent_at' => now(),
                    'failure_message' => null,
                ]);

            if ($updated === 1) {
                $this->writeEmailLog($revision, 'submitted');
            }
        } catch (Throwable $exception) {
            $this->markFailed($revision, $exception);
            $this->writeErrorEmailLog($revision);
            $this->logFailure($revision);

            throw $exception;
        }
    }

    public function failed(Throwable $exception): void
    {
        $revision = SalesInvoiceRevision::query()->find($this->revisionId);

        if ($revision !== null) {
            $this->markFailed($revision, $exception);
        }

        Log::error('Approved sales invoice customer email job failed.', [
            'sale_id' => $revision?->sale_id,
            'revision_id' => $this->revisionId,
            'recipient_email' => $revision?->recipient_email,
        ]);
    }

    private function markFailed(SalesInvoiceRevision $revision, Throwable $exception): void
    {
        SalesInvoiceRevision::query()
            ->whereKey($revision->id)
            ->where('delivery_status', '!=', SalesInvoiceRevision::STATUS_SENT)
            ->update([
                'delivery_status' => SalesInvoiceRevision::STATUS_FAILED,
                'failure_message' => Str::limit($exception->getMessage(), 4000, ''),
            ]);
    }

    private function writeEmailLog(SalesInvoiceRevision $revision, string $status, ?string $providerResponse = null): void
    {
        EmailLog::query()->create([
            'email' => (string) $revision->recipient_email,
            'subject' => $this->subject($revision),
            'message' => $this->summary($revision),
            'status' => $status,
            'provider' => config('mail.default'),
            'provider_response' => $providerResponse,
            'record_type' => 'customer_sales_invoice',
            'record_id' => $revision->sale_id,
        ]);
    }

    private function writeErrorEmailLog(SalesInvoiceRevision $revision): void
    {
        try {
            $this->writeEmailLog($revision, 'error', 'Delivery failed; retry scheduled.');
        } catch (Throwable) {
            Log::error('Approved sales invoice email log write failed.', [
                'sale_id' => $revision->sale_id,
                'revision_id' => $revision->id,
                'recipient_email' => $revision->recipient_email,
            ]);
        }
    }

    private function subject(SalesInvoiceRevision $revision): string
    {
        $prefix = $revision->kind === SalesInvoiceRevision::KIND_UPDATED
            ? 'Updated Sales Invoice Approved'
            : 'Sales Invoice Approved';

        return $prefix.': '.$this->reference($revision);
    }

    private function summary(SalesInvoiceRevision $revision): string
    {
        return sprintf(
            'Approved sales invoice %s emailed to %s.',
            $this->reference($revision),
            $revision->recipient_email,
        );
    }

    private function reference(SalesInvoiceRevision $revision): string
    {
        return (string) (data_get($revision->after_snapshot, 'invoice.reference_no') ?: $revision->sale_id);
    }

    private function logFailure(SalesInvoiceRevision $revision): void
    {
        Log::error('Approved sales invoice customer email failed.', [
            'sale_id' => $revision->sale_id,
            'revision_id' => $revision->id,
            'recipient_email' => $revision->recipient_email,
        ]);
    }
}
