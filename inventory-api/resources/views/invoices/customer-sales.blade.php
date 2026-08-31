<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Sales Invoice {{ $snapshot['invoice']['reference_no'] ?? '' }}</title>
    <style>
        @page { margin: 28px 32px 48px; }
        * { box-sizing: border-box; }
        body {
            color: #1f2933;
            font-family: DejaVu Sans, sans-serif;
            font-size: 9px;
            line-height: 1.4;
            margin: 0;
        }
        table { border-collapse: collapse; width: 100%; }
        td, th { vertical-align: top; }
        .top-bar { background: #168447; height: 8px; margin: -28px -32px 22px; }
        .header { margin-bottom: 20px; }
        .header-left { width: 62%; }
        .header-right { text-align: right; width: 38%; }
        .brand { color: #11683a; font-size: 21px; font-weight: 800; line-height: 1.15; }
        .company-contact { color: #59636e; margin-top: 6px; }
        .invoice-title { color: #11683a; font-size: 23px; font-weight: 800; letter-spacing: 1px; }
        .reference { font-size: 11px; font-weight: 700; margin: 4px 0 7px; }
        .badge {
            background: #dcf5e7;
            border: 1px solid #168447;
            border-radius: 10px;
            color: #11683a;
            display: inline-block;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .7px;
            padding: 3px 10px;
        }
        .info-grid { margin-bottom: 18px; }
        .info-card {
            background: #f4faf6;
            border-left: 4px solid #168447;
            padding: 11px 12px;
            width: 48.5%;
        }
        .info-gap { width: 3%; }
        .section-label {
            color: #168447;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .8px;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        .party-name { font-size: 12px; font-weight: 800; margin-bottom: 3px; }
        .muted { color: #69737d; }
        .meta td { padding: 2px 0; }
        .meta-label { color: #69737d; width: 42%; }
        .meta-value { font-weight: 700; text-align: right; }
        .items { table-layout: fixed; }
        .items thead { display: table-header-group; }
        .items tr { page-break-inside: avoid; }
        .items th {
            background: #168447;
            color: #ffffff;
            font-size: 7.5px;
            letter-spacing: .2px;
            padding: 7px 4px;
            text-align: right;
            text-transform: uppercase;
        }
        .items th:first-child, .items th:nth-child(2) { text-align: left; }
        .items td {
            border-bottom: 1px solid #dce5df;
            padding: 7px 4px;
            text-align: right;
        }
        .items td:first-child, .items td:nth-child(2) { text-align: left; }
        .items tbody tr:nth-child(even) { background: #f8fbf9; }
        .item-name { font-weight: 700; }
        .item-detail { color: #69737d; font-size: 7.5px; margin-top: 2px; }
        .nowrap { white-space: nowrap; }
        .closing { margin-top: 16px; page-break-inside: avoid; }
        .closing-left { padding-right: 26px; width: 57%; }
        .closing-right { width: 43%; }
        .totals td { padding: 3px 2px; }
        .totals-label { color: #59636e; }
        .totals-value { font-weight: 700; text-align: right; white-space: nowrap; }
        .grand td {
            border-top: 2px solid #168447;
            color: #11683a;
            font-size: 11px;
            font-weight: 800;
            padding-top: 7px;
        }
        .words, .note {
            background: #f4faf6;
            border-radius: 4px;
            margin-bottom: 10px;
            padding: 9px 10px;
        }
        .words-value { font-weight: 700; }
        .footer {
            border-top: 1px solid #cad8cf;
            bottom: -12px;
            color: #69737d;
            font-size: 7.5px;
            left: 0;
            padding-top: 7px;
            position: fixed;
            right: 0;
        }
        .footer-right { text-align: right; }
    </style>
</head>
<body>
@php
    $invoice = $snapshot['invoice'] ?? [];
    $company = $snapshot['company'] ?? [];
    $customer = $snapshot['customer'] ?? [];
    $lines = $snapshot['lines'] ?? [];
    $currency = $invoice['currency'] ?? 'BDT';
    $money = fn ($value): string => $currency.' '.number_format((float) ($value ?? 0), 2);
    $quantity = fn ($value): string => rtrim(rtrim(number_format((float) ($value ?? 0), 4, '.', ''), '0'), '.');
    $address = function (array $party): string {
        return implode(', ', array_filter([
            $party['address'] ?? null,
            $party['city'] ?? null,
            $party['state'] ?? null,
            $party['postal_code'] ?? null,
            $party['country'] ?? null,
        ], fn ($value): bool => $value !== null && $value !== ''));
    };
    $numberToWords = function (int $number) use (&$numberToWords): string {
        $small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        $tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        if ($number < 20) return $small[$number];
        if ($number < 100) return $tens[intdiv($number, 10)].($number % 10 ? '-'.$small[$number % 10] : '');
        if ($number < 1000) return trim($small[intdiv($number, 100)].' Hundred '.$numberToWords($number % 100));
        if ($number < 100000) return trim($numberToWords(intdiv($number, 1000)).' Thousand '.$numberToWords($number % 1000));
        if ($number < 10000000) return trim($numberToWords(intdiv($number, 100000)).' Lakh '.$numberToWords($number % 100000));

        return trim($numberToWords(intdiv($number, 10000000)).' Crore '.$numberToWords($number % 10000000));
    };
    $amount = round((float) ($invoice['grand_total'] ?? 0), 2);
    $whole = (int) floor($amount);
    $paisa = (int) round(($amount - $whole) * 100);
    $amountInWords = ($whole === 0 ? 'Zero' : $numberToWords($whole)).' Taka'
        .($paisa > 0 ? ' and '.$numberToWords($paisa).' Paisa' : '').' Only';
@endphp

<div class="top-bar"></div>

<table class="header">
    <tr>
        <td class="header-left">
            <div class="brand">{{ $company['name'] ?? 'Company' }}</div>
            <div class="company-contact">
                @if($address($company)) {{ $address($company) }}<br> @endif
                @if($company['phone_number'] ?? null) {{ $company['phone_number'] }} @endif
                @if(($company['phone_number'] ?? null) && ($company['email'] ?? null)) &nbsp;|&nbsp; @endif
                @if($company['email'] ?? null) {{ $company['email'] }} @endif
            </div>
        </td>
        <td class="header-right">
            <div class="invoice-title">SALES INVOICE</div>
            <div class="reference">{{ $invoice['reference_no'] ?? $invoice['id'] ?? '' }}</div>
            <span class="badge">APPROVED</span>
        </td>
    </tr>
</table>

<table class="info-grid">
    <tr>
        <td class="info-card">
            <div class="section-label">Bill to</div>
            <div class="party-name">{{ $customer['name'] ?? 'Walk-in Customer' }}</div>
            @if($address($customer)) <div>{{ $address($customer) }}</div> @endif
            @if($customer['phone_number'] ?? null) <div>{{ $customer['phone_number'] }}</div> @endif
            @if($customer['email'] ?? null) <div>{{ $customer['email'] }}</div> @endif
        </td>
        <td class="info-gap"></td>
        <td class="info-card">
            <div class="section-label">Invoice details</div>
            <table class="meta">
                <tr><td class="meta-label">Invoice date</td><td class="meta-value">{{ $invoice['sale_date'] ?? '-' }}</td></tr>
                <tr><td class="meta-label">Warehouse</td><td class="meta-value">{{ $invoice['warehouse']['name'] ?? '-' }}</td></tr>
                <tr><td class="meta-label">Approved by</td><td class="meta-value">{{ $invoice['approver']['name'] ?? '-' }}</td></tr>
                <tr><td class="meta-label">Approved on</td><td class="meta-value">{{ !empty($invoice['approved_at']) ? \Illuminate\Support\Carbon::parse($invoice['approved_at'])->setTimezone(config('app.timezone'))->format('d M Y, h:i A') : '-' }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<table class="items">
    <thead>
        <tr>
            <th style="width:4%">#</th>
            <th style="width:31%">Product</th>
            <th style="width:7%">Qty</th>
            <th style="width:7%">Unit</th>
            <th style="width:14%">Unit price</th>
            <th style="width:11%">Discount</th>
            <th style="width:12%">Tax</th>
            <th style="width:14%">Total</th>
        </tr>
    </thead>
    <tbody>
        @foreach($lines as $index => $line)
            <tr>
                <td>{{ $index + 1 }}</td>
                <td>
                    <div class="item-name">{{ $line['product_name'] ?? '-' }}</div>
                    <div class="item-detail">
                        Code: {{ $line['product_code'] ?? '-' }}
                        @if($line['variant'] ?? null) &nbsp;|&nbsp; Variant: {{ $line['variant'] }} @endif
                        @if($line['batch'] ?? null) &nbsp;|&nbsp; Batch: {{ $line['batch'] }} @endif
                    </div>
                </td>
                <td class="nowrap">{{ $quantity($line['qty'] ?? 0) }}</td>
                <td>{{ $line['unit'] ?? '-' }}</td>
                <td class="nowrap">{{ $money($line['unit_price'] ?? 0) }}</td>
                <td class="nowrap">{{ $money($line['discount'] ?? 0) }}</td>
                <td>
                    <div class="nowrap">{{ $money($line['tax'] ?? 0) }}</div>
                    <div class="item-detail">{{ number_format((float) ($line['tax_rate'] ?? 0), 2) }}%</div>
                </td>
                <td class="nowrap"><strong>{{ $money($line['total'] ?? 0) }}</strong></td>
            </tr>
        @endforeach
    </tbody>
</table>

<table class="closing">
    <tr>
        <td class="closing-left">
            <div class="words">
                <div class="section-label">Amount in words</div>
                <div class="words-value">{{ $amountInWords }}</div>
            </div>
            @if($invoice['sale_note'] ?? null)
                <div class="note">
                    <div class="section-label">Note</div>
                    <div>{{ $invoice['sale_note'] }}</div>
                </div>
            @endif
        </td>
        <td class="closing-right">
            <table class="totals">
                <tr><td class="totals-label">Subtotal</td><td class="totals-value">{{ $money($invoice['total_price'] ?? 0) }}</td></tr>
                <tr><td class="totals-label">Line Discount (included in subtotal)</td><td class="totals-value">{{ $money($invoice['total_discount'] ?? 0) }}</td></tr>
                <tr><td class="totals-label">Order Discount</td><td class="totals-value">- {{ $money($invoice['order_discount'] ?? 0) }}</td></tr>
                <tr><td class="totals-label">Coupon Discount</td><td class="totals-value">- {{ $money($invoice['coupon_discount'] ?? 0) }}</td></tr>
                <tr><td class="totals-label">Order Tax ({{ number_format((float) ($invoice['order_tax_rate'] ?? 0), 2) }}%)</td><td class="totals-value">+ {{ $money($invoice['order_tax'] ?? 0) }}</td></tr>
                <tr><td class="totals-label">Carrying Cost</td><td class="totals-value">+ {{ $money($invoice['shipping_cost'] ?? 0) }}</td></tr>
                <tr class="grand"><td>Grand Total</td><td class="totals-value">{{ $money($invoice['grand_total'] ?? 0) }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<table class="footer">
    <tr>
        <td>Customer copy &nbsp;|&nbsp; Thank you for your business.</td>
        <td class="footer-right">Generated {{ $generatedAt->setTimezone(config('app.timezone'))->format('d M Y, h:i A') }}</td>
    </tr>
</table>
</body>
</html>
