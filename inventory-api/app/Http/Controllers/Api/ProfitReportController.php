<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfitReportController extends Controller
{
    public function __invoke(Request $request): JsonResponse
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

        $salesInvoices = DB::table('sales')
            ->whereBetween('sale_date', [$start->toDateString(), $end->toDateString()])
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
            ->when($warehouseId, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->selectRaw('
                COALESCE(SUM(total_tax), 0) as total_tax,
                COALESCE(SUM(order_tax), 0) as order_tax
            ')
            ->first();

        $salesLines = $this->salesLines($start, $end, $warehouseId, $search)->get();
        $returnLines = $this->returnLines($start, $end, $warehouseId, $search)->get();
        $summarySalesLines = $this->salesLines($start, $end, $warehouseId, '')->get();
        $summaryReturnLines = $this->returnLines($start, $end, $warehouseId, '')->get();

        $products = [];

        foreach ($salesLines as $line) {
            $row = $this->productRow($products, $line);
            $net = (float) $line->net_sales;
            $cost = (float) $line->cost;

            $row['qty_sold'] += (float) $line->qty_sold;
            $row['net_sales'] += $net;
            $row['cost'] += $cost;
            $products[$line->product_id] = $row;
        }

        foreach ($returnLines as $line) {
            $row = $this->productRow($products, $line);
            $net = (float) $line->net_returns;
            $cost = (float) $line->return_cost;

            $row['qty_returned'] += (float) $line->qty_returned;
            $row['net_returns'] += $net;
            $row['cost'] -= $cost;
            $products[$line->product_id] = $row;
        }

        $salesGross = (float) $summarySalesLines->sum('gross_sales');
        $salesLineRevenue = (float) $summarySalesLines->sum('net_sales');
        $salesCost = (float) $summarySalesLines->sum('cost');
        $returnRevenue = (float) $summaryReturnLines->sum('net_returns');
        $returnCost = (float) $summaryReturnLines->sum('return_cost');

        $orderDiscount = (float) $salesInvoices->order_discount;
        $couponDiscount = (float) $salesInvoices->coupon_discount;
        $shipping = (float) $salesInvoices->shipping_cost;
        $netRevenue = $salesLineRevenue - $orderDiscount - $couponDiscount + $shipping - $returnRevenue;
        $netCost = $salesCost - $returnCost;
        $netProfit = $netRevenue - $netCost;

        $productRows = collect($products)
            ->map(function (array $row) {
                $row['cost'] = $this->round($row['cost']);
                $row['profit'] = $this->round($row['net_sales'] - $row['net_returns'] - $row['cost']);
                $row['margin_percent'] = $this->margin($row['profit'], $row['net_sales'] - $row['net_returns']);

                return $this->roundRow($row);
            })
            ->sortBy('name')
            ->values();

        $warehouse = $warehouseId ? Warehouse::query()->find($warehouseId, ['id', 'name']) : null;

        return response()->json([
            'summary' => [
                'gross_sales' => $this->round($salesGross),
                'sales_discounts' => $this->round($this->salesLineDiscounts($start, $end, $warehouseId)),
                'coupon_discounts' => $this->round($couponDiscount),
                'shipping' => $this->round($shipping),
                'returns' => $this->round($returnRevenue),
                'cost_of_goods_sold' => $this->round($salesCost),
                'return_cost' => $this->round($returnCost),
                'tax_collected' => $this->round((float) $salesInvoices->total_tax + (float) $salesInvoices->order_tax),
                'tax_returned' => $this->round((float) $returnInvoices->total_tax + (float) $returnInvoices->order_tax),
                'net_revenue' => $this->round($netRevenue),
                'net_profit' => $this->round($netProfit),
                'margin_percent' => $this->margin($netProfit, $netRevenue),
            ],
            'products' => $productRows,
            'filters' => [
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'warehouse' => $warehouse ? ['id' => $warehouse->id, 'name' => $warehouse->name] : null,
                'search' => $search,
            ],
        ]);
    }

    private function salesLines(Carbon $start, Carbon $end, ?int $warehouseId, string $search)
    {
        return DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->join('products', 'products.id', '=', 'product_sales.product_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
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

    private function returnLines(Carbon $start, Carbon $end, ?int $warehouseId, string $search)
    {
        return DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->join('products', 'products.id', '=', 'product_returns.product_id')
            ->whereBetween('returns.return_date', [$start->toDateString(), $end->toDateString()])
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

    private function salesLineDiscounts(Carbon $start, Carbon $end, ?int $warehouseId): float
    {
        return (float) DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->when($warehouseId, fn ($query) => $query->where('sales.warehouse_id', $warehouseId))
            ->sum('product_sales.discount');
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
            'cost' => 0.0,
            'profit' => 0.0,
            'margin_percent' => 0.0,
        ];
    }

    private function roundRow(array $row): array
    {
        foreach (['qty_sold', 'qty_returned', 'net_sales', 'net_returns', 'cost', 'profit', 'margin_percent'] as $key) {
            $row[$key] = $this->round($row[$key]);
        }

        return $row;
    }

    private function margin(float $profit, float $revenue): float
    {
        return $revenue !== 0.0 ? $this->round($profit / $revenue * 100) : 0.0;
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
