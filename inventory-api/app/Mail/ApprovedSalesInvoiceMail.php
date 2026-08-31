<?php

namespace App\Mail;

use App\Models\SalesInvoiceRevision;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;

class ApprovedSalesInvoiceMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public SalesInvoiceRevision $revision,
        public string $pdfBytes,
        public string $pdfFilename,
    ) {}

    public function envelope(): Envelope
    {
        $prefix = $this->revision->kind === SalesInvoiceRevision::KIND_UPDATED
            ? 'Updated Sales Invoice Approved'
            : 'Sales Invoice Approved';

        return new Envelope(
            subject: $prefix.': '.$this->reference(),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.sales-invoice-approved',
        );
    }

    public function headers(): Headers
    {
        return new Headers(
            messageId: "sales-invoice-revision-{$this->revision->id}@inventory.local",
        );
    }

    /** @return list<Attachment> */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn (): string => $this->pdfBytes)
                ->as($this->pdfFilename)
                ->withMime('application/pdf'),
        ];
    }

    private function reference(): string
    {
        return (string) (data_get($this->revision->after_snapshot, 'invoice.reference_no') ?: $this->revision->sale_id);
    }
}
