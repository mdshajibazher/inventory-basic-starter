<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Services\ApprovalService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ProfitReportController extends Controller
{
    private const DETAIL_METRICS = [
        'net_revenue' => 'Net Revenue',
        'net_cost_of_goods_sold' => 'Net COGS',
        'gross_profit' => 'Gross Profit',
        'expenses' => 'Expenses',
        'net_profit' => 'Net Profit',
        'margin' => 'Margin',
        'cash_in' => 'Cash In',
        'cash_out' => 'Cash Out',
        'net_cash_movement' => 'Cash Movement',
        'tax' => 'Tax',
        'returns' => 'Returns',
        'purchase_returns' => 'Purchase Returns',
        'discounts' => 'Discounts',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        return response()->json($this->reportData($request));
    }

    public function details(Request $request): JsonResponse
    {
        $data = $request->validate([
            'metric' => ['required', 'string', 'in:'.implode(',', array_keys(self::DETAIL_METRICS))],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $start = isset($data['start_date'])
            ? Carbon::parse($data['start_date'])->startOfDay()
            : now()->startOfMonth()->startOfDay();
        $end = isset($data['end_date'])
            ? Carbon::parse($data['end_date'])->endOfDay()
            : now()->endOfMonth()->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $search = trim((string) ($data['search'] ?? ''));
        $billerId = $request->user()->requireCurrentBillerId();
        $report = $this->reportData($request);
        $metric = $data['metric'];
        $summary = $report['summary'];
        $products = collect($report['products']);
        $rows = $this->detailRows($metric, $start, $end, $warehouseId, $billerId, $search, $report);
        $total = $metric === 'margin'
            ? (float) $summary['margin_percent']
            : (float) match ($metric) {
                'discounts' => $summary['sales_discounts'] + $summary['order_discounts'] + $summary['coupon_discounts'] + $summary['payment_discounts'],
                'purchase_returns' => $summary['purchase_return_cost'],
                default => $summary[$metric] ?? 0,
            };

        return response()->json([
            'metric' => [
                'key' => $metric,
                'label' => self::DETAIL_METRICS[$metric],
                'value' => $this->round($total),
                'value_type' => $metric === 'margin' ? 'percent' : 'money',
            ],
            'columns' => $metric === 'margin'
                ? ['Product', 'Revenue', 'Profit', 'Margin']
                : ['Date', 'Reference', 'Type', 'Description', 'Amount'],
            'rows' => $rows->values(),
            'summary' => [
                'total' => $this->round($total),
                'total_type' => $metric === 'margin' ? 'percent' : 'money',
                'row_count' => $rows->count(),
                'components' => collect($this->detailComponents($metric, $summary, $products))
                    ->map(fn (array $component) => [
                        ...$component,
                        'amount' => $this->round((float) $component['amount']),
                    ])
                    ->values(),
            ],
            'filters' => $report['filters'],
        ]);
    }

    public function pdf(Request $request): Response
    {
        $report = $this->reportData($request);
        $filename = sprintf(
            'profit-report-%s-to-%s.pdf',
            $report['filters']['start_date'],
            $report['filters']['end_date']
        );

        return Pdf::loadView('reports.profit', ['report' => $report])
            ->setPaper('a4', 'landscape')
            ->download($filename);
    }

    private function reportData(Request $request): array
    {
        $data = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $start = isset($data['start_date'])
            ? Carbon::parse($data['start_date'])->startOfDay()
            : now()->startOfMonth()->startOfDay();
        $end = isset($data['end_date'])
            ? Carbon::parse($data['end_date'])->endOfDay()
            : now()->endOfMonth()->endOfDay();
        $warehouseId = $data['warehouse_id'] ?? null;
        $search = trim((string) ($data['search'] ?? ''));
        $billerId = $request->user()->requireCurrentBillerId();

        $salesInvoices = DB::table('sales')
            ->whereBetween('sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('biller_id', $billerId)
            ->where('approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->selectRaw('
                COALESCE(SUM(order_discount), 0) as order_discount,
                COALESCE(SUM(coupon_discount), 0) as coupon_discount,
                COALESCE(SUM(shipping_cost), 0) as shipping_cost,
                COALESCE(SUM(total_tax), 0) as total_tax,
                COALESCE(SUM(order_tax), 0) as order_tax
            ')
            ->first();

        $returnInvoices = DB::table('returns')
            ->whereBetween('return_date', [$start->toDateString(), $end->toDateString()])
            ->where('biller_id', $billerId)
            ->where('approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->selectRaw('
                COALESCE(SUM(total_tax), 0) as total_tax,
                COALESCE(SUM(order_tax), 0) as order_tax
            ')
            ->first();

        $productRows = $this->productRows($start, $end, $warehouseId, $billerId, $search);
        $summarySalesLines = $this->salesLines($start, $end, $warehouseId, $billerId, '')->get();
        $summaryReturnLines = $this->returnLines($start, $end, $warehouseId, $billerId, '')->get();
        $summaryPurchaseReturnLines = $this->purchaseReturnLines($start, $end, $warehouseId, $billerId, '')->get();
        $expenses = $this->expenses($start, $end, $warehouseId, $billerId);
        $cash = $this->cash($start, $end, $warehouseId, $billerId);

        $salesGross = (float) $summarySalesLines->sum('gross_sales');
        $salesLineRevenue = (float) $summarySalesLines->sum('net_sales');
        $salesCost = (float) $summarySalesLines->sum('cost');
        $returnRevenue = (float) $summaryReturnLines->sum('net_returns');
        $returnCost = (float) $summaryReturnLines->sum('return_cost');
        $purchaseReturnCost = (float) $summaryPurchaseReturnLines->sum('purchase_return_cost');
        $expenseTotal = (float) $expenses->sum('amount');
        $paymentDiscount = $this->paymentDiscounts($start, $end, $warehouseId, $billerId);

        $orderDiscount = (float) $salesInvoices->order_discount;
        $couponDiscount = (float) $salesInvoices->coupon_discount;
        $shipping = (float) $salesInvoices->shipping_cost;

        $netRevenue = $salesLineRevenue - $orderDiscount - $couponDiscount - $paymentDiscount + $shipping - $returnRevenue;
        $netCost = $salesCost - $returnCost - $purchaseReturnCost;
        $grossProfit = $netRevenue - $netCost;
        $netProfit = $grossProfit - $expenseTotal;
        $cashIn = (float) $cash->where('direction', 'in')->sum('amount');
        $cashOut = (float) $cash->where('direction', 'out')->sum('amount');

        $warehouse = $warehouseId ? Warehouse::query()->find($warehouseId, ['id', 'name']) : null;

        return [
            'summary' => [
                'gross_sales' => $this->round($salesGross),
                'sales_discounts' => $this->round($this->salesLineDiscounts($start, $end, $warehouseId, $billerId)),
                'order_discounts' => $this->round($orderDiscount),
                'coupon_discounts' => $this->round($couponDiscount),
                'payment_discounts' => $this->round($paymentDiscount),
                'shipping' => $this->round($shipping),
                'returns' => $this->round($returnRevenue),
                'cost_of_goods_sold' => $this->round($salesCost),
                'return_cost' => $this->round($returnCost),
                'purchase_return_cost' => $this->round($purchaseReturnCost),
                'net_cost_of_goods_sold' => $this->round($netCost),
                'gross_profit' => $this->round($grossProfit),
                'expenses' => $this->round($expenseTotal),
                'tax_collected' => $this->round((float) $salesInvoices->total_tax + (float) $salesInvoices->order_tax),
                'tax_returned' => $this->round((float) $returnInvoices->total_tax + (float) $returnInvoices->order_tax),
                'net_revenue' => $this->round($netRevenue),
                'net_profit' => $this->round($netProfit),
                'margin_percent' => $this->margin($netProfit, $netRevenue),
                'cash_in' => $this->round($cashIn),
                'cash_out' => $this->round($cashOut),
                'net_cash_movement' => $this->round($cashIn - $cashOut),
            ],
            'products' => $productRows,
            'warehouses' => $this->warehouses($start, $end, $warehouseId, $billerId),
            'categories' => $this->categories($start, $end, $warehouseId, $billerId),
            'expenses' => $expenses->values(),
            'cash' => $cash->values(),
            'filters' => [
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'warehouse' => $warehouse ? ['id' => $warehouse->id, 'name' => $warehouse->name] : null,
                'search' => $search,
            ],
        ];
    }

    private function productRows(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, string $search): Collection
    {
        $salesLines = $this->salesLines($start, $end, $warehouseId, $billerId, $search)->get();
        $returnLines = $this->returnLines($start, $end, $warehouseId, $billerId, $search)->get();
        $purchaseReturnLines = $this->purchaseReturnLines($start, $end, $warehouseId, $billerId, $search)->get();
        $products = [];

        foreach ($salesLines as $line) {
            $row = $this->productRow($products, $line);
            $row['qty_sold'] += (float) $line->qty_sold;
            $row['net_sales'] += (float) $line->net_sales;
            $row['cost'] += (float) $line->cost;
            $products[$line->product_id] = $row;
        }

        foreach ($returnLines as $line) {
            $row = $this->productRow($products, $line);
            $row['qty_returned'] += (float) $line->qty_returned;
            $row['net_returns'] += (float) $line->net_returns;
            $row['cost'] -= (float) $line->return_cost;
            $products[$line->product_id] = $row;
        }

        foreach ($purchaseReturnLines as $line) {
            $row = $this->productRow($products, $line);
            $row['purchase_return_qty'] += (float) $line->purchase_return_qty;
            $row['purchase_return_cost'] += (float) $line->purchase_return_cost;
            $row['cost'] -= (float) $line->purchase_return_cost;
            $products[$line->product_id] = $row;
        }

        return collect($products)
            ->map(function (array $row) {
                $row['cost'] = $this->round($row['cost']);
                $row['profit'] = $this->round($row['net_sales'] - $row['net_returns'] - $row['cost']);
                $row['gross_profit'] = $row['profit'];
                $row['margin_percent'] = $this->margin($row['profit'], $row['net_sales'] - $row['net_returns']);

                return $this->roundRow($row, ['qty_sold', 'qty_returned', 'purchase_return_qty', 'net_sales', 'net_returns', 'purchase_return_cost', 'cost', 'profit', 'gross_profit', 'margin_percent']);
            })
            ->sortBy('name')
            ->values();
    }

    private function salesLines(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, string $search)
    {
        return DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->join('products', 'products.id', '=', 'product_sales.product_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('sales.biller_id', $billerId)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('products.name', 'like', "%{$search}%")
                        ->orWhere('products.code', 'like', "%{$search}%");
                });
            })
            ->groupBy('products.id', 'products.code', 'products.name')
            ->selectRaw('
                products.id as product_id,
                products.code,
                products.name,
                COALESCE(SUM(product_sales.qty), 0) as qty_sold,
                COALESCE(SUM(product_sales.net_unit_price * product_sales.qty), 0) as gross_sales,
                COALESCE(SUM((product_sales.net_unit_price * product_sales.qty) - product_sales.discount), 0) as net_sales,
                COALESCE(SUM(product_sales.total_cost), 0) as cost
            ');
    }

    private function returnLines(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, string $search)
    {
        return DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->join('products', 'products.id', '=', 'product_returns.product_id')
            ->whereBetween('returns.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('returns.biller_id', $billerId)
            ->where('returns.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('returns.warehouse_id', $warehouseId))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('products.name', 'like', "%{$search}%")
                        ->orWhere('products.code', 'like', "%{$search}%");
                });
            })
            ->groupBy('products.id', 'products.code', 'products.name')
            ->selectRaw('
                products.id as product_id,
                products.code,
                products.name,
                COALESCE(SUM(product_returns.qty), 0) as qty_returned,
                COALESCE(SUM((product_returns.net_unit_price * product_returns.qty) - product_returns.discount), 0) as net_returns,
                COALESCE(SUM(product_returns.total_cost), 0) as return_cost
            ');
    }

    private function purchaseReturnLines(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, string $search)
    {
        return DB::table('purchase_product_return')
            ->join('return_purchases', 'return_purchases.id', '=', 'purchase_product_return.return_id')
            ->join('products', 'products.id', '=', 'purchase_product_return.product_id')
            ->whereBetween('return_purchases.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('return_purchases.biller_id', $billerId)
            ->where('return_purchases.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('return_purchases.warehouse_id', $warehouseId))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('products.name', 'like', "%{$search}%")
                        ->orWhere('products.code', 'like', "%{$search}%");
                });
            })
            ->groupBy('products.id', 'products.code', 'products.name')
            ->selectRaw('
                products.id as product_id,
                products.code,
                products.name,
                COALESCE(SUM(purchase_product_return.qty), 0) as purchase_return_qty,
                COALESCE(SUM(purchase_product_return.total), 0) as purchase_return_cost
            ');
    }

    private function expenses(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('expenses')
            ->leftJoin('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->whereBetween('expenses.created_at', [$start, $end])
            ->where('expenses.biller_id', $billerId)
            ->when($warehouseId, fn ($query) => $query->where('expenses.warehouse_id', $warehouseId))
            ->groupBy('expenses.expense_category_id', 'expense_categories.name')
            ->selectRaw('
                expenses.expense_category_id as category_id,
                COALESCE(expense_categories.name, \'Uncategorized\') as category_name,
                COALESCE(SUM(expenses.amount), 0) as amount
            ')
            ->get()
            ->map(fn ($row) => [
                'category_id' => $row->category_id ? (int) $row->category_id : null,
                'category_name' => $row->category_name,
                'amount' => $this->round((float) $row->amount),
            ]);
    }

    private function cash(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        $directionExpression = "
            CASE
                WHEN payments.direction IN ('in', 'out') THEN payments.direction
                WHEN payments.purchase_id IS NOT NULL OR payments.sale_return_id IS NOT NULL THEN 'out'
                ELSE 'in'
            END
        ";
        $typeExpression = "
            COALESCE(
                payments.payment_type,
                CASE
                    WHEN payments.purchase_id IS NOT NULL THEN 'purchase_payment'
                    WHEN payments.sale_return_id IS NOT NULL THEN 'sale_return_refund'
                    WHEN payments.purchase_return_id IS NOT NULL THEN 'purchase_return_refund'
                    ELSE 'sale_payment'
                END
            )
        ";

        return DB::table('payments')
            ->leftJoin('sales as payment_sales', 'payment_sales.id', '=', 'payments.sale_id')
            ->leftJoin('purchases as payment_purchases', 'payment_purchases.id', '=', 'payments.purchase_id')
            ->leftJoin('returns as payment_returns', 'payment_returns.id', '=', 'payments.sale_return_id')
            ->leftJoin('return_purchases as payment_return_purchases', 'payment_return_purchases.id', '=', 'payments.purchase_return_id')
            ->whereBetween('payments.created_at', [$start, $end])
            ->where('payments.biller_id', $billerId)
            ->where('payments.approval_status', ApprovalService::APPROVED)
            ->where(function ($query) {
                $query->whereNull('payments.sale_id')
                    ->orWhere('payment_sales.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.purchase_id')
                    ->orWhere('payment_purchases.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.sale_return_id')
                    ->orWhere('payment_returns.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.purchase_return_id')
                    ->orWhere('payment_return_purchases.approval_status', ApprovalService::APPROVED);
            })
            ->when($warehouseId, function ($query) use ($warehouseId) {
                $query->where(function ($inner) use ($warehouseId) {
                    $inner->where('payment_sales.warehouse_id', $warehouseId)
                        ->orWhere('payment_purchases.warehouse_id', $warehouseId)
                        ->orWhere('payment_returns.warehouse_id', $warehouseId)
                        ->orWhere('payment_return_purchases.warehouse_id', $warehouseId);
                });
            })
            ->groupByRaw($typeExpression.', '.$directionExpression)
            ->selectRaw($typeExpression.' as payment_type, '.$directionExpression.' as direction, COALESCE(SUM(payments.amount), 0) as amount')
            ->get()
            ->map(fn ($row) => [
                'payment_type' => $row->payment_type,
                'label' => $this->paymentTypeLabel((string) $row->payment_type),
                'direction' => $row->direction,
                'amount' => $this->round((float) $row->amount),
            ]);
    }

    private function warehouses(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        $rows = [];

        foreach ($this->warehouseSales($start, $end, $warehouseId, $billerId) as $line) {
            $row = $this->breakdownRow($rows, (int) $line->warehouse_id, $line->warehouse_name);
            $row['net_revenue'] += (float) $line->net_sales;
            $row['cost'] += (float) $line->cost;
            $rows[$line->warehouse_id] = $row;
        }

        foreach ($this->warehouseReturns($start, $end, $warehouseId, $billerId) as $line) {
            $row = $this->breakdownRow($rows, (int) $line->warehouse_id, $line->warehouse_name);
            $row['returns'] += (float) $line->net_returns;
            $row['cost'] -= (float) $line->return_cost;
            $rows[$line->warehouse_id] = $row;
        }

        foreach ($this->warehousePurchaseReturns($start, $end, $warehouseId, $billerId) as $line) {
            $row = $this->breakdownRow($rows, (int) $line->warehouse_id, $line->warehouse_name);
            $row['purchase_return_cost'] += (float) $line->purchase_return_cost;
            $row['cost'] -= (float) $line->purchase_return_cost;
            $rows[$line->warehouse_id] = $row;
        }

        foreach ($this->warehouseExpenses($start, $end, $warehouseId, $billerId) as $line) {
            $row = $this->breakdownRow($rows, (int) $line->warehouse_id, $line->warehouse_name);
            $row['expenses'] += (float) $line->amount;
            $rows[$line->warehouse_id] = $row;
        }

        return collect($rows)
            ->map(fn (array $row) => $this->finishBreakdownRow($row))
            ->sortBy('name')
            ->values();
    }

    private function categories(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        $rows = [];

        foreach ($this->categorySales($start, $end, $warehouseId, $billerId) as $line) {
            $key = $line->category_id ?: 0;
            $row = $this->breakdownRow($rows, (int) $key, $line->category_name);
            $row['net_revenue'] += (float) $line->net_sales;
            $row['cost'] += (float) $line->cost;
            $rows[$key] = $row;
        }

        foreach ($this->categoryReturns($start, $end, $warehouseId, $billerId) as $line) {
            $key = $line->category_id ?: 0;
            $row = $this->breakdownRow($rows, (int) $key, $line->category_name);
            $row['returns'] += (float) $line->net_returns;
            $row['cost'] -= (float) $line->return_cost;
            $rows[$key] = $row;
        }

        foreach ($this->categoryPurchaseReturns($start, $end, $warehouseId, $billerId) as $line) {
            $key = $line->category_id ?: 0;
            $row = $this->breakdownRow($rows, (int) $key, $line->category_name);
            $row['purchase_return_cost'] += (float) $line->purchase_return_cost;
            $row['cost'] -= (float) $line->purchase_return_cost;
            $rows[$key] = $row;
        }

        return collect($rows)
            ->map(fn (array $row) => $this->finishBreakdownRow($row))
            ->sortBy('name')
            ->values();
    }

    private function warehouseSales(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->join('warehouses', 'warehouses.id', '=', 'sales.warehouse_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('sales.biller_id', $billerId)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->groupBy('sales.warehouse_id', 'warehouses.name')
            ->selectRaw('
                sales.warehouse_id,
                warehouses.name as warehouse_name,
                COALESCE(SUM((product_sales.net_unit_price * product_sales.qty) - product_sales.discount), 0) as net_sales,
                COALESCE(SUM(product_sales.total_cost), 0) as cost
            ')
            ->get();
    }

    private function warehouseReturns(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->join('warehouses', 'warehouses.id', '=', 'returns.warehouse_id')
            ->whereBetween('returns.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('returns.biller_id', $billerId)
            ->where('returns.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('returns.warehouse_id', $warehouseId))
            ->groupBy('returns.warehouse_id', 'warehouses.name')
            ->selectRaw('
                returns.warehouse_id,
                warehouses.name as warehouse_name,
                COALESCE(SUM((product_returns.net_unit_price * product_returns.qty) - product_returns.discount), 0) as net_returns,
                COALESCE(SUM(product_returns.total_cost), 0) as return_cost
            ')
            ->get();
    }

    private function warehousePurchaseReturns(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('purchase_product_return')
            ->join('return_purchases', 'return_purchases.id', '=', 'purchase_product_return.return_id')
            ->join('warehouses', 'warehouses.id', '=', 'return_purchases.warehouse_id')
            ->whereBetween('return_purchases.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('return_purchases.biller_id', $billerId)
            ->where('return_purchases.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('return_purchases.warehouse_id', $warehouseId))
            ->groupBy('return_purchases.warehouse_id', 'warehouses.name')
            ->selectRaw('
                return_purchases.warehouse_id,
                warehouses.name as warehouse_name,
                COALESCE(SUM(purchase_product_return.total), 0) as purchase_return_cost
            ')
            ->get();
    }

    private function warehouseExpenses(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('expenses')
            ->join('warehouses', 'warehouses.id', '=', 'expenses.warehouse_id')
            ->whereBetween('expenses.created_at', [$start, $end])
            ->where('expenses.biller_id', $billerId)
            ->when($warehouseId, fn ($query) => $query->where('expenses.warehouse_id', $warehouseId))
            ->groupBy('expenses.warehouse_id', 'warehouses.name')
            ->selectRaw('
                expenses.warehouse_id,
                warehouses.name as warehouse_name,
                COALESCE(SUM(expenses.amount), 0) as amount
            ')
            ->get();
    }

    private function categorySales(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->join('products', 'products.id', '=', 'product_sales.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('sales.biller_id', $billerId)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->groupBy('products.category_id', 'categories.name')
            ->selectRaw('
                products.category_id,
                COALESCE(categories.name, \'Uncategorized\') as category_name,
                COALESCE(SUM((product_sales.net_unit_price * product_sales.qty) - product_sales.discount), 0) as net_sales,
                COALESCE(SUM(product_sales.total_cost), 0) as cost
            ')
            ->get();
    }

    private function categoryReturns(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->join('products', 'products.id', '=', 'product_returns.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereBetween('returns.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('returns.biller_id', $billerId)
            ->where('returns.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('returns.warehouse_id', $warehouseId))
            ->groupBy('products.category_id', 'categories.name')
            ->selectRaw('
                products.category_id,
                COALESCE(categories.name, \'Uncategorized\') as category_name,
                COALESCE(SUM((product_returns.net_unit_price * product_returns.qty) - product_returns.discount), 0) as net_returns,
                COALESCE(SUM(product_returns.total_cost), 0) as return_cost
            ')
            ->get();
    }

    private function categoryPurchaseReturns(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('purchase_product_return')
            ->join('return_purchases', 'return_purchases.id', '=', 'purchase_product_return.return_id')
            ->join('products', 'products.id', '=', 'purchase_product_return.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereBetween('return_purchases.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('return_purchases.biller_id', $billerId)
            ->where('return_purchases.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('return_purchases.warehouse_id', $warehouseId))
            ->groupBy('products.category_id', 'categories.name')
            ->selectRaw('
                products.category_id,
                COALESCE(categories.name, \'Uncategorized\') as category_name,
                COALESCE(SUM(purchase_product_return.total), 0) as purchase_return_cost
            ')
            ->get();
    }

    private function salesLineDiscounts(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): float
    {
        return (float) DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('sales.biller_id', $billerId)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->sum('product_sales.discount');
    }

    private function paymentDiscounts(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): float
    {
        return (float) DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->whereBetween('payments.created_at', [$start, $end])
            ->where('payments.biller_id', $billerId)
            ->where('payments.payment_type', 'sale_payment')
            ->where('payments.approval_status', ApprovalService::APPROVED)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->sum('payments.discount_amount');
    }

    private function paymentDiscountEntryRows(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->whereBetween('payments.created_at', [$start, $end])
            ->where('payments.biller_id', $billerId)
            ->where('payments.payment_type', 'sale_payment')
            ->where('payments.approval_status', ApprovalService::APPROVED)
            ->where('sales.approval_status', ApprovalService::APPROVED)
            ->where('payments.discount_amount', '>', 0)
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->select(['payments.id', 'payments.payment_reference', 'payments.created_at', 'payments.discount_amount', 'payments.payment_note'])
            ->latest('payments.id')
            ->get()
            ->map(fn ($row) => [
                'date' => Carbon::parse($row->created_at)->toDateString(),
                'label' => 'Payment discount',
                'reference' => $row->payment_reference,
                'type' => 'Sales payment discount',
                'description' => $row->payment_note,
                'amount' => $this->round((float) $row->discount_amount),
                'amount_type' => 'money',
            ]);
    }

    private function detailRows(string $metric, Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, string $search, array $report): Collection
    {
        $summary = $report['summary'];

        return match ($metric) {
            'net_revenue' => collect([
                ...$this->productDetailRows($report['products'], 'Net sales', 'net_sales'),
                ...$this->componentRows([
                    ['Sales returns', -1 * (float) $summary['returns']],
                    ['Order discounts', -1 * (float) $summary['order_discounts']],
                    ['Coupon discounts', -1 * (float) $summary['coupon_discounts']],
                    ['Payment discounts', -1 * (float) $summary['payment_discounts']],
                    ['Shipping', (float) $summary['shipping']],
                ]),
            ]),
            'net_cost_of_goods_sold' => collect($this->componentRows([
                ['Cost of goods sold', (float) $summary['cost_of_goods_sold']],
                ['Sales return cost', -1 * (float) $summary['return_cost']],
                ['Purchase return cost', -1 * (float) $summary['purchase_return_cost']],
            ])),
            'gross_profit' => collect($this->componentRows([
                ['Net revenue', (float) $summary['net_revenue']],
                ['Cost of goods sold', -1 * (float) $summary['cost_of_goods_sold']],
                ['Return cost reversal', (float) $summary['return_cost']],
                ['Purchase return COGS reduction', (float) $summary['purchase_return_cost']],
            ])),
            'expenses' => $this->expenseEntryRows($start, $end, $warehouseId, $billerId),
            'net_profit' => collect([
                ...$this->componentRows([['Gross profit', (float) $summary['gross_profit']]]),
                ...$this->expenseEntryRows($start, $end, $warehouseId, $billerId)->map(fn ($row) => [...$row, 'amount' => -1 * (float) $row['amount']])->all(),
            ]),
            'margin' => collect($report['products'])->map(fn ($product) => [
                'label' => $product['name'],
                'reference' => $product['code'],
                'type' => 'Product margin',
                'description' => $product['name'],
                'amount' => (float) $product['margin_percent'],
                'amount_type' => 'percent',
                'revenue' => (float) $product['net_sales'] - (float) $product['net_returns'],
                'profit' => (float) $product['profit'],
            ]),
            'cash_in' => $this->paymentEntryRows($start, $end, $warehouseId, $billerId, 'in'),
            'cash_out' => $this->paymentEntryRows($start, $end, $warehouseId, $billerId, 'out'),
            'net_cash_movement' => $this->paymentEntryRows($start, $end, $warehouseId, $billerId, null),
            'tax' => collect($this->componentRows([
                ['Tax collected', (float) $summary['tax_collected']],
                ['Tax returned', -1 * (float) $summary['tax_returned']],
            ])),
            'returns' => collect($this->productDetailRows($report['products'], 'Sales return', 'net_returns')),
            'purchase_returns' => collect($this->productDetailRows($report['products'], 'Purchase return', 'purchase_return_cost')),
            'discounts' => collect([
                ...$this->componentRows([
                    ['Line discounts', (float) $summary['sales_discounts']],
                    ['Order discounts', (float) $summary['order_discounts']],
                    ['Coupon discounts', (float) $summary['coupon_discounts']],
                ]),
                ...$this->paymentDiscountEntryRows($start, $end, $warehouseId, $billerId)->all(),
            ]),
        };
    }

    private function detailComponents(string $metric, array $summary, Collection $products): array
    {
        return match ($metric) {
            'net_revenue' => [
                ['label' => 'Product net sales', 'amount' => $this->round((float) $products->sum('net_sales'))],
                ['label' => 'Sales returns', 'amount' => -1 * (float) $summary['returns']],
                ['label' => 'Order discounts', 'amount' => -1 * (float) $summary['order_discounts']],
                ['label' => 'Coupon discounts', 'amount' => -1 * (float) $summary['coupon_discounts']],
                ['label' => 'Payment discounts', 'amount' => -1 * (float) $summary['payment_discounts']],
                ['label' => 'Shipping', 'amount' => (float) $summary['shipping']],
            ],
            'net_cost_of_goods_sold' => [
                ['label' => 'Cost of goods sold', 'amount' => (float) $summary['cost_of_goods_sold']],
                ['label' => 'Sales return cost', 'amount' => -1 * (float) $summary['return_cost']],
                ['label' => 'Purchase return cost', 'amount' => -1 * (float) $summary['purchase_return_cost']],
            ],
            'gross_profit' => [
                ['label' => 'Net revenue', 'amount' => (float) $summary['net_revenue']],
                ['label' => 'Net COGS', 'amount' => -1 * (float) $summary['net_cost_of_goods_sold']],
            ],
            'net_profit' => [
                ['label' => 'Gross profit', 'amount' => (float) $summary['gross_profit']],
                ['label' => 'Expenses', 'amount' => -1 * (float) $summary['expenses']],
            ],
            'cash_in' => [['label' => 'Cash in', 'amount' => (float) $summary['cash_in']]],
            'cash_out' => [['label' => 'Cash out', 'amount' => (float) $summary['cash_out']]],
            'net_cash_movement' => [
                ['label' => 'Cash in', 'amount' => (float) $summary['cash_in']],
                ['label' => 'Cash out', 'amount' => -1 * (float) $summary['cash_out']],
            ],
            'tax' => [
                ['label' => 'Tax collected', 'amount' => (float) $summary['tax_collected']],
                ['label' => 'Tax returned', 'amount' => -1 * (float) $summary['tax_returned']],
            ],
            'discounts' => [
                ['label' => 'Line discounts', 'amount' => (float) $summary['sales_discounts']],
                ['label' => 'Order discounts', 'amount' => (float) $summary['order_discounts']],
                ['label' => 'Coupon discounts', 'amount' => (float) $summary['coupon_discounts']],
                ['label' => 'Payment discounts', 'amount' => (float) $summary['payment_discounts']],
            ],
            default => [],
        };
    }

    private function productDetailRows(iterable $products, string $type, string $amountKey): array
    {
        return collect($products)
            ->filter(fn ($product) => (float) ($product[$amountKey] ?? 0) !== 0.0)
            ->map(fn ($product) => [
                'label' => $product['name'],
                'reference' => $product['code'],
                'type' => $type,
                'description' => $product['name'],
                'amount' => $this->round((float) ($product[$amountKey] ?? 0)),
                'amount_type' => 'money',
                'quantity' => $product['qty_sold'] ?? $product['qty_returned'] ?? $product['purchase_return_qty'] ?? null,
            ])
            ->values()
            ->all();
    }

    private function componentRows(array $components): array
    {
        return collect($components)
            ->filter(fn ($component) => (float) $component[1] !== 0.0)
            ->map(fn ($component) => [
                'label' => $component[0],
                'reference' => null,
                'type' => 'Formula component',
                'description' => $component[0],
                'amount' => $this->round((float) $component[1]),
                'amount_type' => 'money',
            ])
            ->values()
            ->all();
    }

    private function expenseEntryRows(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId): Collection
    {
        return DB::table('expenses')
            ->leftJoin('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->leftJoin('warehouses', 'warehouses.id', '=', 'expenses.warehouse_id')
            ->whereBetween('expenses.created_at', [$start, $end])
            ->where('expenses.biller_id', $billerId)
            ->when($warehouseId, fn ($query) => $query->where('expenses.warehouse_id', $warehouseId))
            ->latest('expenses.id')
            ->get([
                'expenses.reference_no',
                'expenses.created_at',
                'expenses.amount',
                'expenses.note',
                'expense_categories.name as category_name',
                'warehouses.name as warehouse_name',
            ])
            ->map(fn ($row) => [
                'date' => Carbon::parse($row->created_at)->toDateString(),
                'label' => $row->category_name ?? 'Uncategorized',
                'reference' => $row->reference_no,
                'type' => 'Expense',
                'description' => trim(($row->warehouse_name ? "{$row->warehouse_name} · " : '').($row->note ?? '')),
                'amount' => $this->round((float) $row->amount),
                'amount_type' => 'money',
            ]);
    }

    private function paymentEntryRows(Carbon $start, Carbon $end, ?int $warehouseId, int $billerId, ?string $direction): Collection
    {
        $directionExpression = "
            CASE
                WHEN payments.direction IN ('in', 'out') THEN payments.direction
                WHEN payments.purchase_id IS NOT NULL OR payments.sale_return_id IS NOT NULL THEN 'out'
                ELSE 'in'
            END
        ";
        $typeExpression = "
            COALESCE(
                payments.payment_type,
                CASE
                    WHEN payments.purchase_id IS NOT NULL THEN 'purchase_payment'
                    WHEN payments.sale_return_id IS NOT NULL THEN 'sale_return_refund'
                    WHEN payments.purchase_return_id IS NOT NULL THEN 'purchase_return_refund'
                    ELSE 'sale_payment'
                END
            )
        ";

        return DB::table('payments')
            ->leftJoin('sales as payment_sales', 'payment_sales.id', '=', 'payments.sale_id')
            ->leftJoin('purchases as payment_purchases', 'payment_purchases.id', '=', 'payments.purchase_id')
            ->leftJoin('returns as payment_returns', 'payment_returns.id', '=', 'payments.sale_return_id')
            ->leftJoin('return_purchases as payment_return_purchases', 'payment_return_purchases.id', '=', 'payments.purchase_return_id')
            ->whereBetween('payments.created_at', [$start, $end])
            ->where('payments.biller_id', $billerId)
            ->where('payments.approval_status', ApprovalService::APPROVED)
            ->where(function ($query) {
                $query->whereNull('payments.sale_id')->orWhere('payment_sales.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.purchase_id')->orWhere('payment_purchases.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.sale_return_id')->orWhere('payment_returns.approval_status', ApprovalService::APPROVED);
            })
            ->where(function ($query) {
                $query->whereNull('payments.purchase_return_id')->orWhere('payment_return_purchases.approval_status', ApprovalService::APPROVED);
            })
            ->when($warehouseId, function ($query) use ($warehouseId) {
                $query->where(function ($inner) use ($warehouseId) {
                    $inner->where('payment_sales.warehouse_id', $warehouseId)
                        ->orWhere('payment_purchases.warehouse_id', $warehouseId)
                        ->orWhere('payment_returns.warehouse_id', $warehouseId)
                        ->orWhere('payment_return_purchases.warehouse_id', $warehouseId);
                });
            })
            ->selectRaw("payments.payment_reference, payments.created_at, payments.amount, payments.payment_note, {$typeExpression} as payment_type, {$directionExpression} as computed_direction")
            ->latest('payments.id')
            ->get()
            ->filter(fn ($row) => $direction === null || $row->computed_direction === $direction)
            ->map(fn ($row) => [
                'date' => Carbon::parse($row->created_at)->toDateString(),
                'label' => $this->paymentTypeLabel((string) $row->payment_type),
                'reference' => $row->payment_reference,
                'type' => $row->computed_direction === 'in' ? 'Cash in' : 'Cash out',
                'description' => $row->payment_note,
                'amount' => $this->round(($row->computed_direction === 'out' && $direction === null ? -1 : 1) * (float) $row->amount),
                'amount_type' => 'money',
            ])
            ->values();
    }

    private function productRow(array $products, object $line): array
    {
        return $products[$line->product_id] ?? [
            'product_id' => (int) $line->product_id,
            'code' => $line->code,
            'name' => $line->name,
            'qty_sold' => 0.0,
            'qty_returned' => 0.0,
            'net_sales' => 0.0,
            'net_returns' => 0.0,
            'purchase_return_qty' => 0.0,
            'purchase_return_cost' => 0.0,
            'cost' => 0.0,
            'profit' => 0.0,
            'gross_profit' => 0.0,
            'margin_percent' => 0.0,
        ];
    }

    private function breakdownRow(array $rows, int $id, string $name): array
    {
        return $rows[$id] ?? [
            'id' => $id,
            'name' => $name,
            'net_revenue' => 0.0,
            'returns' => 0.0,
            'purchase_return_cost' => 0.0,
            'cost' => 0.0,
            'gross_profit' => 0.0,
            'expenses' => 0.0,
            'net_profit' => 0.0,
            'margin_percent' => 0.0,
        ];
    }

    private function finishBreakdownRow(array $row): array
    {
        $row['net_revenue'] -= $row['returns'];
        $row['gross_profit'] = $row['net_revenue'] - $row['cost'];
        $row['net_profit'] = $row['gross_profit'] - $row['expenses'];
        $row['margin_percent'] = $this->margin($row['net_profit'], $row['net_revenue']);

        return $this->roundRow($row, ['net_revenue', 'returns', 'purchase_return_cost', 'cost', 'gross_profit', 'expenses', 'net_profit', 'margin_percent']);
    }

    private function roundRow(array $row, array $keys): array
    {
        foreach ($keys as $key) {
            $row[$key] = $this->round($row[$key]);
        }

        return $row;
    }

    private function paymentTypeLabel(string $type): string
    {
        return match ($type) {
            'customer_advance' => 'Customer advance',
            'purchase_payment' => 'Purchase payment',
            'supplier_advance' => 'Supplier advance',
            'sale_return_refund' => 'Sale return refund',
            'purchase_return_refund' => 'Purchase return refund',
            default => 'Sale payment',
        };
    }

    private function margin(float $profit, float $revenue): float
    {
        return $revenue !== 0.0 ? $this->round($profit / $revenue * 100) : 0.0;
    }

    private function round(float $value): float
    {
        $rounded = round($value, 2);

        return $rounded === 0.0 ? 0.0 : $rounded;
    }
}
