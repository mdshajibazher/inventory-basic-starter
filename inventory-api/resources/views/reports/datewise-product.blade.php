<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Datewise Product Report</title>
    <style>
        @page {
            margin: 18px 24px 16px;
        }

        html,
        body {
            margin: 0;
            padding: 0;
        }

        body {
            color: #000;
            font-family: DejaVu Sans, sans-serif;
            font-size: 12px;
            line-height: 1.25;
        }

        .page {
            padding: 18px 20px 10px;
        }

        .header {
            margin-bottom: 26px;
            text-align: center;
        }

        h1 {
            font-size: 22px;
            margin: 0 0 14px;
        }

        .company {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 12px;
        }

        .address {
            margin: 0 auto;
            width: 420px;
        }

        .range {
            font-size: 14px;
            font-weight: bold;
            margin-top: 16px;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        th {
            background: #d9d9d9;
            font-weight: normal;
            text-align: left;
        }

        th, td {
            border-bottom: 2px solid #dfe3e6;
            border-right: 2px solid #fff;
            padding: 7px 6px;
        }

        .sl {
            width: 34px;
        }

        .date {
            width: 92px;
        }

        .unit, .price, .qty, .type, .amount {
            white-space: nowrap;
        }

        .summary {
            margin-left: auto;
            margin-top: 28px;
            text-align: right;
            width: 360px;
        }

        .summary p {
            font-size: 14px;
            font-weight: bold;
            margin: 0 0 16px;
        }

        .words {
            margin-top: 28px;
            text-align: right;
        }

        .words p {
            margin: 0 0 14px;
        }
    </style>
</head>
<body>
    @php
        $summary = $report['summary'];
        $format = fn ($value) => rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.');
        $date = fn ($value) => \Carbon\Carbon::parse($value)->format('d-M-Y');
    @endphp

    <div class="page">
        <div class="header">
            <h1>Datewise Product Report</h1>
            <div class="company">{{ $report['company']['name'] }}</div>
            <div class="address">
                {{ $report['company']['address'] }}<br>
                <strong>Email :</strong> {{ $report['company']['email'] }}<br>
                <strong>Phone:</strong> {{ $report['company']['phone'] }}
            </div>
            <div class="range">From {{ $date($report['filters']['start_date']) }} To {{ $date($report['filters']['end_date']) }}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th class="sl">Sl.</th>
                    <th class="date">Date</th>
                    <th>Customer Name</th>
                    <th>Product Name</th>
                    <th class="unit">Unit</th>
                    <th class="price">Unit Price</th>
                    <th class="qty">Qty</th>
                    <th class="type">Type</th>
                    <th class="amount">Amount</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($report['rows'] as $row)
                    <tr>
                        <td>{{ $row['sl'] }}</td>
                        <td>{{ $row['date'] }}</td>
                        <td>{{ $row['customer_name'] }}</td>
                        <td>{{ $row['product_name'] }}</td>
                        <td>{{ $row['unit'] }}</td>
                        <td>{{ $format($row['unit_price']) }}</td>
                        <td>{{ $format($row['qty']) }}</td>
                        <td>{{ $row['type'] }}</td>
                        <td>{{ $format($row['amount']) }}</td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="9">No product rows found in this date range.</td>
                    </tr>
                @endforelse
            </tbody>
        </table>

        <div class="summary">
            <p>Total Sales Amount: {{ $format($summary['total_sales_amount']) }}</p>
            <p>Total Return Amount: {{ $format($summary['total_return_amount']) }}</p>
            <p>Total Sales Qty : {{ $format($summary['total_sales_qty']) }}</p>
            <p>Total Return Qty : {{ $format($summary['total_return_qty']) }}</p>
            <p>Profitable Qty : {{ $format($summary['profitable_qty']) }}</p>
            <p>Profitable Amount : {{ $format($summary['profitable_amount']) }}</p>
        </div>

        <div class="words">
            <p>Sales In Words: {{ $summary['sales_in_words'] }}</p>
            <p>Returns In Words: {{ $summary['returns_in_words'] }}</p>
        </div>
    </div>
</body>
</html>
