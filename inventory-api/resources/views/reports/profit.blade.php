<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Profit Report</title>
    <style>
        body {
            color: #111827;
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            line-height: 1.35;
        }

        h1 {
            font-size: 22px;
            margin: 0 0 4px;
        }

        h2 {
            border-bottom: 1px solid #d1d5db;
            font-size: 14px;
            margin: 18px 0 8px;
            padding-bottom: 4px;
        }

        table {
            border-collapse: collapse;
            margin-bottom: 10px;
            width: 100%;
        }

        th, td {
            border: 1px solid #e5e7eb;
            padding: 6px 7px;
            vertical-align: top;
        }

        th {
            background: #f3f4f6;
            color: #374151;
            font-size: 10px;
            text-align: left;
            text-transform: uppercase;
        }

        .meta {
            color: #4b5563;
            margin-bottom: 14px;
        }

        .grid {
            width: 100%;
        }

        .grid td {
            width: 25%;
        }

        .label {
            color: #6b7280;
            font-size: 10px;
            text-transform: uppercase;
        }

        .value {
            font-size: 14px;
            font-weight: bold;
            margin-top: 2px;
        }

        .right {
            text-align: right;
        }
    </style>
</head>
<body>
    @php
        $summary = $report['summary'];
        $money = fn ($value) => number_format((float) $value, 2);
        $number = fn ($value) => number_format((float) $value, 2);
    @endphp

    <h1>Profit Report</h1>
    <div class="meta">
        Date range: {{ $report['filters']['start_date'] }} to {{ $report['filters']['end_date'] }}
        @if ($report['filters']['warehouse'])
            | Warehouse: {{ $report['filters']['warehouse']['name'] }}
        @else
            | Warehouse: All warehouses
        @endif
        @if ($report['filters']['search'])
            | Product search: {{ $report['filters']['search'] }}
        @endif
    </div>

    <table class="grid">
        <tr>
            <td><div class="label">Net revenue</div><div class="value">{{ $money($summary['net_revenue']) }}</div></td>
            <td><div class="label">Net COGS</div><div class="value">{{ $money($summary['net_cost_of_goods_sold']) }}</div></td>
            <td><div class="label">Gross profit</div><div class="value">{{ $money($summary['gross_profit']) }}</div></td>
            <td><div class="label">Net profit</div><div class="value">{{ $money($summary['net_profit']) }}</div></td>
        </tr>
        <tr>
            <td><div class="label">Expenses</div><div class="value">{{ $money($summary['expenses']) }}</div></td>
            <td><div class="label">Margin</div><div class="value">{{ $number($summary['margin_percent']) }}%</div></td>
            <td><div class="label">Cash in</div><div class="value">{{ $money($summary['cash_in']) }}</div></td>
            <td><div class="label">Cash out</div><div class="value">{{ $money($summary['cash_out']) }}</div></td>
        </tr>
        <tr>
            <td><div class="label">Purchase returns</div><div class="value">{{ $money($summary['purchase_return_cost']) }}</div></td>
            <td><div class="label">Sales return cost</div><div class="value">{{ $money($summary['return_cost']) }}</div></td>
            <td><div class="label">Sales returns</div><div class="value">{{ $money($summary['returns']) }}</div></td>
            <td><div class="label">Net cash movement</div><div class="value">{{ $money($summary['net_cash_movement']) }}</div></td>
        </tr>
    </table>

    <h2>Cash Movement</h2>
    <table>
        <thead>
            <tr>
                <th>Type</th>
                <th>Direction</th>
                <th class="right">Amount</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($report['cash'] as $row)
                <tr>
                    <td>{{ $row['label'] }}</td>
                    <td>{{ ucfirst($row['direction']) }}</td>
                    <td class="right">{{ $money($row['amount']) }}</td>
                </tr>
            @empty
                <tr><td colspan="3">No cash movement in this date range.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Expenses</h2>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th class="right">Amount</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($report['expenses'] as $row)
                <tr>
                    <td>{{ $row['category_name'] }}</td>
                    <td class="right">{{ $money($row['amount']) }}</td>
                </tr>
            @empty
                <tr><td colspan="2">No expenses in this date range.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Warehouse Profit</h2>
    <table>
        <thead>
            <tr>
                <th>Warehouse</th>
                <th class="right">Net revenue</th>
                <th class="right">Cost</th>
                <th class="right">Purchase returns</th>
                <th class="right">Expenses</th>
                <th class="right">Net profit</th>
                <th class="right">Margin</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($report['warehouses'] as $row)
                <tr>
                    <td>{{ $row['name'] }}</td>
                    <td class="right">{{ $money($row['net_revenue']) }}</td>
                    <td class="right">{{ $money($row['cost']) }}</td>
                    <td class="right">{{ $money($row['purchase_return_cost']) }}</td>
                    <td class="right">{{ $money($row['expenses']) }}</td>
                    <td class="right">{{ $money($row['net_profit']) }}</td>
                    <td class="right">{{ $number($row['margin_percent']) }}%</td>
                </tr>
            @empty
                <tr><td colspan="7">No warehouse rows in this date range.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Category Profit</h2>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th class="right">Net revenue</th>
                <th class="right">Cost</th>
                <th class="right">Purchase returns</th>
                <th class="right">Profit</th>
                <th class="right">Margin</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($report['categories'] as $row)
                <tr>
                    <td>{{ $row['name'] }}</td>
                    <td class="right">{{ $money($row['net_revenue']) }}</td>
                    <td class="right">{{ $money($row['cost']) }}</td>
                    <td class="right">{{ $money($row['purchase_return_cost']) }}</td>
                    <td class="right">{{ $money($row['net_profit']) }}</td>
                    <td class="right">{{ $number($row['margin_percent']) }}%</td>
                </tr>
            @empty
                <tr><td colspan="6">No category rows in this date range.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Products</h2>
    <table>
        <thead>
            <tr>
                <th>Product</th>
                <th>Code</th>
                <th class="right">Sold</th>
                <th class="right">Returned</th>
                <th class="right">Net sales</th>
                <th class="right">Net returns</th>
                <th class="right">Purchase returns</th>
                <th class="right">Cost</th>
                <th class="right">Profit</th>
                <th class="right">Margin</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($report['products'] as $row)
                <tr>
                    <td>{{ $row['name'] }}</td>
                    <td>{{ $row['code'] }}</td>
                    <td class="right">{{ $number($row['qty_sold']) }}</td>
                    <td class="right">{{ $number($row['qty_returned']) }}</td>
                    <td class="right">{{ $money($row['net_sales']) }}</td>
                    <td class="right">{{ $money($row['net_returns']) }}</td>
                    <td class="right">{{ $money($row['purchase_return_cost']) }}</td>
                    <td class="right">{{ $money($row['cost']) }}</td>
                    <td class="right">{{ $money($row['profit']) }}</td>
                    <td class="right">{{ $number($row['margin_percent']) }}%</td>
                </tr>
            @empty
                <tr><td colspan="10">No product sales or returns matched these filters.</td></tr>
            @endforelse
        </tbody>
    </table>
</body>
</html>
