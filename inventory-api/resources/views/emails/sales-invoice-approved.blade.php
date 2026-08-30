@php
    $snapshot = $revision->after_snapshot ?? [];
    $invoice = $snapshot['invoice'] ?? [];
    $company = $snapshot['company'] ?? [];
    $customer = $snapshot['customer'] ?? [];
    $lines = $snapshot['lines'] ?? [];
    $changes = $revision->changes ?? [];
    $money = static fn (mixed $value): string => 'BDT '.number_format((float) ($value ?? 0), 2, '.', ',');
    $quantity = static function (mixed $value): string {
        $formatted = rtrim(rtrim(number_format((float) ($value ?? 0), 4, '.', ''), '0'), '.');

        return $formatted === '' ? '0' : $formatted;
    };
    $totalLabels = [
        'total_price' => 'Subtotal',
        'total_discount' => 'Line discount',
        'order_discount' => 'Order discount',
        'coupon_discount' => 'Coupon discount',
        'order_tax' => 'Order tax',
        'shipping_cost' => 'Shipping cost',
        'grand_total' => 'Grand total',
    ];
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ data_get($invoice, 'reference_no') }}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6f4;color:#233129;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f3f6f4;border-collapse:collapse;">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width:100%;max-width:680px;background:#ffffff;border-collapse:collapse;border-radius:8px;overflow:hidden;">
                <tr>
                    <td style="background:#177245;padding:28px 32px;color:#ffffff;">
                        <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#dff3e6;">Approved sales invoice</div>
                        <div style="font-size:26px;line-height:34px;font-weight:700;margin-top:6px;">{{ data_get($company, 'name') ?: 'Sales Invoice' }}</div>
                        @if (data_get($company, 'address'))
                            <div style="font-size:13px;line-height:20px;margin-top:5px;color:#e9f7ed;">{{ data_get($company, 'address') }}</div>
                        @endif
                        @if (data_get($company, 'email') || data_get($company, 'phone_number'))
                            <div style="font-size:13px;line-height:20px;color:#e9f7ed;">
                                {{ data_get($company, 'email') }}@if (data_get($company, 'email') && data_get($company, 'phone_number')) · @endif{{ data_get($company, 'phone_number') }}
                            </div>
                        @endif
                    </td>
                </tr>
                <tr>
                    <td style="padding:30px 32px 12px;">
                        <p style="margin:0 0 12px;font-size:16px;line-height:24px;">Hello {{ data_get($customer, 'name') ?: 'Customer' }},</p>
                        <p style="margin:0;font-size:15px;line-height:23px;color:#526158;">
                            @if ($revision->kind === \App\Models\SalesInvoiceRevision::KIND_UPDATED)
                                Your updated sales invoice has been approved. The complete current invoice and its changes are shown below.
                            @else
                                Your sales invoice has been approved. The complete approved invoice is shown below.
                            @endif
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:18px 32px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#f1f8f3;border:1px solid #d7eadc;">
                            <tr>
                                <td style="padding:12px 14px;font-size:12px;color:#587060;text-transform:uppercase;">Reference</td>
                                <td style="padding:12px 14px;font-size:14px;font-weight:700;text-align:right;">{{ data_get($invoice, 'reference_no') }}</td>
                            </tr>
                            <tr>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:12px;color:#587060;text-transform:uppercase;">Invoice date</td>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:14px;text-align:right;">{{ data_get($invoice, 'sale_date') ?: '—' }}</td>
                            </tr>
                            <tr>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:12px;color:#587060;text-transform:uppercase;">Status</td>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:14px;text-align:right;text-transform:capitalize;">{{ data_get($invoice, 'approval_status') }}</td>
                            </tr>
                            <tr>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:12px;color:#587060;text-transform:uppercase;">Grand total</td>
                                <td style="padding:12px 14px;border-top:1px solid #d7eadc;font-size:16px;font-weight:700;text-align:right;color:#177245;">{{ $money(data_get($invoice, 'grand_total')) }}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 32px 24px;">
                        <h2 style="margin:0 0 12px;font-size:18px;line-height:26px;color:#1f3f2b;">Current approved products</h2>
                        <div style="width:100%;overflow-x:auto;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;min-width:620px;border-collapse:collapse;border:1px solid #dce5df;">
                                <tr style="background:#e8f3eb;">
                                    <th align="left" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Product</th>
                                    <th align="right" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Qty</th>
                                    <th align="right" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Unit price</th>
                                    <th align="right" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Discount</th>
                                    <th align="right" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Tax</th>
                                    <th align="right" style="padding:10px 9px;font-size:11px;color:#3e5746;text-transform:uppercase;">Total</th>
                                </tr>
                                @foreach ($lines as $line)
                                    <tr>
                                        <td style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;line-height:18px;">
                                            <strong>{{ data_get($line, 'product_name') }}</strong>
                                            @if (data_get($line, 'product_code'))<br><span style="color:#68766d;">{{ data_get($line, 'product_code') }}</span>@endif
                                            @if (data_get($line, 'variant'))<br><span style="color:#68766d;">Variant: {{ data_get($line, 'variant') }}</span>@endif
                                            @if (data_get($line, 'batch'))<br><span style="color:#68766d;">Batch: {{ data_get($line, 'batch') }}</span>@endif
                                        </td>
                                        <td align="right" style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;white-space:nowrap;">{{ $quantity(data_get($line, 'qty')) }} {{ data_get($line, 'unit') }}</td>
                                        <td align="right" style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;white-space:nowrap;">{{ $money(data_get($line, 'unit_price')) }}</td>
                                        <td align="right" style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;white-space:nowrap;">{{ $money(data_get($line, 'discount')) }}</td>
                                        <td align="right" style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;white-space:nowrap;">{{ $money(data_get($line, 'tax')) }}<br><span style="font-size:11px;color:#68766d;">{{ number_format((float) data_get($line, 'tax_rate'), 2) }}%</span></td>
                                        <td align="right" style="padding:11px 9px;border-top:1px solid #dce5df;font-size:13px;font-weight:700;white-space:nowrap;">{{ $money(data_get($line, 'total')) }}</td>
                                    </tr>
                                @endforeach
                            </table>
                        </div>
                    </td>
                </tr>
                @if ($revision->kind === \App\Models\SalesInvoiceRevision::KIND_UPDATED)
                    <tr>
                        <td style="padding:4px 32px 24px;">
                            <h2 style="margin:0 0 6px;font-size:18px;line-height:26px;color:#1f3f2b;">Revision changes</h2>
                            <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#68766d;">Compared with the previously approved invoice.</p>
                            <div style="width:100%;overflow-x:auto;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;min-width:760px;border-collapse:collapse;border:1px solid #dce5df;">
                                    <tr style="background:#edf1ee;">
                                        <th align="left" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Change</th>
                                        <th align="left" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Product</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Qty</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Unit</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Unit price</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Discount</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Tax rate</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Tax</th>
                                        <th align="right" style="padding:9px 7px;font-size:10px;text-transform:uppercase;">Total</th>
                                    </tr>
                                    @foreach (($changes['removed_lines'] ?? []) as $line)
                                        <tr style="background:#fde8e8;text-decoration:line-through;">
                                            <td style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:11px;font-weight:700;color:#9e3535;">REMOVED</td>
                                            <td style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ data_get($line, 'product_name') }} @if (data_get($line, 'product_code'))({{ data_get($line, 'product_code') }})@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ $quantity(data_get($line, 'qty')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ data_get($line, 'unit') }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ $money(data_get($line, 'unit_price')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ $money(data_get($line, 'discount')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ number_format((float) data_get($line, 'tax_rate'), 2) }}%</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ $money(data_get($line, 'tax')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #ebcccc;font-size:12px;">{{ $money(data_get($line, 'total')) }}</td>
                                        </tr>
                                    @endforeach
                                    @foreach (($changes['added_lines'] ?? []) as $line)
                                        <tr style="background:#e4f6e9;">
                                            <td style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:11px;font-weight:700;color:#28783f;">ADDED</td>
                                            <td style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ data_get($line, 'product_name') }} @if (data_get($line, 'product_code'))({{ data_get($line, 'product_code') }})@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ $quantity(data_get($line, 'qty')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ data_get($line, 'unit') }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ $money(data_get($line, 'unit_price')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ $money(data_get($line, 'discount')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ number_format((float) data_get($line, 'tax_rate'), 2) }}%</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ $money(data_get($line, 'tax')) }}</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #c9e5d1;font-size:12px;">{{ $money(data_get($line, 'total')) }}</td>
                                        </tr>
                                    @endforeach
                                    @foreach (($changes['modified_lines'] ?? []) as $line)
                                        @php($fields = data_get($line, 'fields', []))
                                        <tr style="background:#fff5d9;">
                                            <td style="padding:9px 7px;border-top:1px solid #eadcae;font-size:11px;font-weight:700;color:#8a6612;">CHANGED</td>
                                            <td style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;">{{ data_get($line, 'after.product_name') }} @if (data_get($line, 'after.product_code'))({{ data_get($line, 'after.product_code') }})@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['qty'])){{ $quantity(data_get($fields, 'qty.before')) }} → {{ $quantity(data_get($fields, 'qty.after')) }}@else{{ $quantity(data_get($line, 'after.qty')) }}@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['unit'])){{ data_get($fields, 'unit.before') }} → {{ data_get($fields, 'unit.after') }}@else{{ data_get($line, 'after.unit') }}@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['unit_price'])){{ $money(data_get($fields, 'unit_price.before')) }} → {{ $money(data_get($fields, 'unit_price.after')) }}@else{{ $money(data_get($line, 'after.unit_price')) }}@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['discount'])){{ $money(data_get($fields, 'discount.before')) }} → {{ $money(data_get($fields, 'discount.after')) }}@else{{ $money(data_get($line, 'after.discount')) }}@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['tax_rate'])){{ number_format((float) data_get($fields, 'tax_rate.before'), 2) }}% → {{ number_format((float) data_get($fields, 'tax_rate.after'), 2) }}%@else{{ number_format((float) data_get($line, 'after.tax_rate'), 2) }}%@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['tax'])){{ $money(data_get($fields, 'tax.before')) }} → {{ $money(data_get($fields, 'tax.after')) }}@else{{ $money(data_get($line, 'after.tax')) }}@endif</td>
                                            <td align="right" style="padding:9px 7px;border-top:1px solid #eadcae;font-size:12px;white-space:nowrap;">@if (isset($fields['total'])){{ $money(data_get($fields, 'total.before')) }} → {{ $money(data_get($fields, 'total.after')) }}@else{{ $money(data_get($line, 'after.total')) }}@endif</td>
                                        </tr>
                                    @endforeach
                                </table>
                            </div>
                            @if (($changes['changed_totals'] ?? []) !== [])
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin-top:14px;border-collapse:collapse;border:1px solid #eadcae;background:#fffaf0;">
                                    @foreach ($totalLabels as $field => $label)
                                        @if (isset($changes['changed_totals'][$field]))
                                            <tr>
                                                <td style="padding:9px 11px;border-top:1px solid #eadcae;font-size:12px;font-weight:700;">{{ $label }}</td>
                                                <td align="right" style="padding:9px 11px;border-top:1px solid #eadcae;font-size:12px;">{{ $money(data_get($changes, "changed_totals.{$field}.before")) }} → {{ $money(data_get($changes, "changed_totals.{$field}.after")) }}</td>
                                            </tr>
                                        @endif
                                    @endforeach
                                </table>
                            @endif
                        </td>
                    </tr>
                @endif
                <tr>
                    <td style="padding:22px 32px;background:#f1f8f3;border-top:1px solid #d7eadc;">
                        <p style="margin:0 0 7px;font-size:14px;line-height:21px;font-weight:700;color:#1f3f2b;">Your approved PDF is attached.</p>
                        <p style="margin:0;font-size:12px;line-height:19px;color:#68766d;">Please keep the attached invoice for your records.</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
