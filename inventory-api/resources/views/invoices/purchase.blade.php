<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Purchase Invoice</title>
    <style>
        @page { margin: 26px 34px; }
        body { color: #111; font-family: DejaVu Sans, sans-serif; font-size: 13px; line-height: 1.35; }
        h1 { font-size: 22px; margin: 6px 0 24px; text-align: center; text-transform: uppercase; }
        table { border-collapse: collapse; width: 100%; }
        th, td { vertical-align: top; }
        .print-date { margin-bottom: 16px; }
        .company-grid { margin-bottom: 34px; width: 100%; }
        .company-grid td { width: 50%; }
        .company-right { border-left: 2px solid #111; padding-left: 36px; }
        .brand { margin-bottom: 14px; }
        .brand-text { color: #078a3b; font-size: 34px; font-weight: 800; letter-spacing: 1px; line-height: 1; }
        .brand-sub { color: #078a3b; font-size: 14px; font-weight: 700; letter-spacing: .5px; margin-left: 4px; text-transform: uppercase; }
        .section-title { font-size: 16px; font-weight: 800; margin: 0 0 10px; }
        .kv { margin-bottom: 8px; width: 100%; }
        .kv .label { font-weight: 800; width: 88px; }
        .kv .colon { font-weight: 800; text-align: center; width: 18px; }
        .company-name { font-size: 18px; font-weight: 800; margin-bottom: 10px; }
        .company-address { font-size: 14px; margin-bottom: 26px; white-space: pre-line; }
        .invoice-meta { font-weight: 800; margin-bottom: 18px; width: 68%; }
        .invoice-meta td { padding-right: 28px; white-space: nowrap; }
        .items th, .items td { border: 1.5px solid #111; padding: 10px 8px; }
        .items th { font-size: 13px; font-weight: 800; text-align: center; }
        .items td { height: 34px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bottom-grid { margin-top: 18px; width: 100%; }
        .bottom-left { padding-top: 115px; width: 58%; }
        .bottom-right { width: 42%; }
        .summary { margin-left: auto; width: 100%; }
        .summary td { padding: 5px 0; }
        .summary .label { font-weight: 800; width: 48%; }
        .summary .colon { font-weight: 800; text-align: center; width: 18px; }
        .summary .currency { text-align: center; width: 28px; }
        .summary .line-top td { border-top: 1.5px solid #111; padding-top: 10px; }
        .summary .grand td { font-size: 15px; font-weight: 900; }
        .words, .note { margin-top: 24px; }
        .words-title, .note-title { font-weight: 800; margin-bottom: 8px; }
        .signatures { bottom: 12px; left: 0; position: fixed; right: 0; width: 100%; }
        .signatures td { text-align: center; width: 33.3333%; }
        .signature-line { border-top: 1.5px solid #111; display: inline-block; padding-top: 8px; width: 190px; }
    </style>
</head>
<body>
@php
    $money = fn ($value) => number_format((float) $value, 2);
    $numberToWords = function (int $number) use (&$numberToWords): string {
        $units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        $tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if ($number < 20) return $units[$number];
        if ($number < 100) return trim($tens[intdiv($number, 10)].' '.$units[$number % 10]);
        if ($number < 1000) return trim($units[intdiv($number, 100)].' Hundred '.$numberToWords($number % 100));
        if ($number < 100000) return trim($numberToWords(intdiv($number, 1000)).' Thousand '.$numberToWords($number % 1000));
        if ($number < 10000000) return trim($numberToWords(intdiv($number, 100000)).' Lakh '.$numberToWords($number % 100000));
        return trim($numberToWords(intdiv($number, 10000000)).' Crore '.$numberToWords($number % 10000000));
    };
    $amountInWordsFor = function (float $amount) use ($numberToWords): string {
        $whole = (int) floor($amount);
        $fraction = (int) round(($amount - $whole) * 100);
        $words = trim($numberToWords($whole));
        return $fraction > 0
            ? sprintf('Taka %s and %s Paisa Only.', $words, trim($numberToWords($fraction)))
            : sprintf('Taka %s Only.', $words ?: 'Zero');
    };
    $companyName = $settings?->company_name ?: $purchase->biller?->company_name ?: $purchase->biller?->name ?: config('app.name');
    $companyAddress = $settings?->company_address ?: collect([$purchase->biller?->address, $purchase->biller?->city, $purchase->biller?->postal_code, $purchase->biller?->country])->filter()->implode(', ');
    $companyEmail = $settings?->company_email ?: $purchase->biller?->email;
    $companyPhone = $settings?->company_phone ?: $purchase->biller?->phone_number;
    $amountInWords = $amountInWordsFor((float) $purchase->grand_total);
@endphp

<h1>Purchase Invoice</h1>
<div class="print-date">Print Date: {{ $printedAt->format('d-M-Y g:i a') }}</div>

<table class="company-grid">
    <tr>
        <td>
            <div class="brand">
                <div class="brand-text">{{ strtoupper($companyName) }}</div>
                <div class="brand-sub">Trade International</div>
            </div>
            <div class="section-title">Supplier Details</div>
            <table class="kv">
                <tr><td class="label">Supplier</td><td class="colon">:</td><td>{{ $purchase->supplier?->name ?? '-' }}</td></tr>
                <tr><td class="label">Phone</td><td class="colon">:</td><td>{{ $purchase->supplier?->phone_number ?? '-' }}</td></tr>
                <tr><td class="label">Email</td><td class="colon">:</td><td>{{ $purchase->supplier?->email ?? '-' }}</td></tr>
            </table>
        </td>
        <td class="company-right">
            <div class="company-name">{{ $companyName }}</div>
            <div class="company-address">{{ $companyAddress }}</div>
            <table class="kv">
                <tr><td class="label">Email</td><td class="colon">:</td><td>{{ $companyEmail ?: '-' }}</td></tr>
                <tr><td class="label">Phone</td><td class="colon">:</td><td>{{ $companyPhone ?: '-' }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<table class="invoice-meta">
    <tr>
        <td>Purchase Date: <span style="font-weight: 400;">{{ optional($purchase->purchase_date)->format('d-M-Y') ?? '-' }}</span></td>
        <td>Purchase ID: <span style="font-weight: 400;"># {{ $purchase->id }}</span></td>
        <td>Reference: <span style="font-weight: 400;">{{ $purchase->reference_no ?: '-' }}</span></td>
    </tr>
</table>

<table class="items">
    <thead>
    <tr>
        <th style="width: 5%;">Sl</th>
        <th style="width: 27%;">Product</th>
        <th style="width: 12%;">Variant/Batch</th>
        <th style="width: 9%;">Qty</th>
        <th style="width: 9%;">Received</th>
        <th style="width: 14%;">Unit Cost<br>(Tk)</th>
        <th style="width: 12%;">Discount<br>(Tk)</th>
        <th style="width: 12%;">Total<br>(Tk)</th>
    </tr>
    </thead>
    <tbody>
    @forelse ($purchase->products as $line)
        <tr>
            <td class="center">{{ $loop->iteration }}</td>
            <td>{{ $line->product?->name ?? '#'.$line->product_id }}</td>
            <td class="center">{{ $line->variant?->name ?? $line->batch?->batch_no ?? $line->batch_no ?? '-' }}</td>
            <td class="center">{{ $money($line->qty) }}</td>
            <td class="center">{{ $money($line->recieved) }}</td>
            <td class="right">{{ $money($line->net_unit_cost) }}</td>
            <td class="right">{{ $money($line->discount) }}</td>
            <td class="right">{{ $money($line->total) }}</td>
        </tr>
    @empty
        <tr><td colspan="8" class="center">No products found.</td></tr>
    @endforelse
    </tbody>
</table>

<table class="bottom-grid">
    <tr>
        <td class="bottom-left">
            <div class="words">
                <div class="words-title">Amount in words:</div>
                <div>{{ $amountInWords }}</div>
            </div>
            <div class="note">
                <div class="note-title">Note:</div>
                <div>{{ $purchase->note ?: '-' }}</div>
            </div>
        </td>
        <td class="bottom-right">
            <table class="summary">
                <tr><td class="label">Subtotal</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->total_cost) }}</td></tr>
                <tr><td class="label">Discount</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->order_discount) }}</td></tr>
                <tr><td class="label">VAT</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->order_tax) }}</td></tr>
                <tr><td class="label">Shipping Cost</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->shipping_cost) }}</td></tr>
                <tr class="line-top grand"><td class="label">Grand Total</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->grand_total) }}</td></tr>
                <tr><td class="label">Paid Amount</td><td class="colon">:</td><td class="currency">Tk</td><td class="right">{{ $money($purchase->paid_amount) }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<table class="signatures">
    <tr>
        <td><span class="signature-line">Prepared By</span></td>
        <td><span class="signature-line">Received By</span></td>
        <td><span class="signature-line">Authorized By</span></td>
    </tr>
</table>
</body>
</html>
