<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;

class SalesInvoicePdfRenderer
{
    public function render(array $snapshot): string
    {
        return Pdf::loadView('invoices.customer-sales', [
            'snapshot' => $snapshot,
            'generatedAt' => now(),
        ])
            ->setPaper('a4', 'portrait')
            ->output();
    }

    public function filename(array $snapshot): string
    {
        $invoice = $snapshot['invoice'] ?? [];
        $reference = trim((string) ($invoice['reference_no'] ?? ''));
        $safeReference = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $reference), '-');
        $identifier = $safeReference !== '' ? $safeReference : (string) ($invoice['id'] ?? 'invoice');

        return "sales-invoice-{$identifier}.pdf";
    }
}
