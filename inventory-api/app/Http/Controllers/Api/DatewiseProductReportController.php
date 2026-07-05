<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GeneralSetting;
use App\Models\Product;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class DatewiseProductReportController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        return response()->json($this->reportData($request));
    }

    public function pdf(Request $request): Response
    {
        $report = $this->reportData($request);
        $filename = sprintf(
            'datewise-product-report-%s-to-%s.pdf',
            $report['filters']['start_date'],
            $report['filters']['end_date']
        );

        return Pdf::loadView('reports.datewise-product', ['report' => $report])
            ->setPaper('a4', 'portrait')
            ->download($filename);
    }

    private function reportData(Request $request): array
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);

        $start = isset($data['start_date'])
            ? Carbon::parse($data['start_date'])->startOfDay()
            : now()->startOfMonth()->startOfDay();
        $end = isset($data['end_date'])
            ? Carbon::parse($data['end_date'])->endOfDay()
            : now()->endOfDay();
        $product = Product::query()->findOrFail($data['product_id'], ['id', 'name', 'code']);

        $rows = $this->rows($start, $end, (int) $product->id);
        $totalSalesAmount = (float) $rows->where('type', 'Sales')->sum('amount');
        $totalReturnAmount = (float) $rows->where('type', 'Return')->sum('amount');
        $totalSalesQty = (float) $rows->where('type', 'Sales')->sum('qty');
        $totalReturnQty = (float) $rows->where('type', 'Return')->sum('qty');
        $totalSalesCost = (float) $rows->where('type', 'Sales')->sum('cost');
        $totalReturnCost = (float) $rows->where('type', 'Return')->sum('cost');
        $profitableAmount = ($totalSalesAmount - $totalReturnAmount) - ($totalSalesCost - $totalReturnCost);
        $profitableQty = $totalSalesQty - $totalReturnQty;

        return [
            'company' => $this->company(),
            'rows' => $rows->values(),
            'summary' => [
                'total_sales_amount' => $this->round($totalSalesAmount),
                'total_return_amount' => $this->round($totalReturnAmount),
                'total_sales_cost' => $this->round($totalSalesCost),
                'total_return_cost' => $this->round($totalReturnCost),
                'total_sales_qty' => $this->round($totalSalesQty),
                'total_return_qty' => $this->round($totalReturnQty),
                'profitable_qty' => $this->round($profitableQty),
                'profitable_amount' => $this->round($profitableAmount),
                'sales_in_words' => $this->numberToWords((int) round($totalSalesAmount)),
                'returns_in_words' => $totalReturnAmount > 0 ? $this->numberToWords((int) round($totalReturnAmount)) : '',
            ],
            'filters' => [
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'product' => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'code' => $product->code,
                ],
            ],
        ];
    }

    private function rows(Carbon $start, Carbon $end, int $productId): Collection
    {
        $sales = DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->join('customers', 'customers.id', '=', 'sales.customer_id')
            ->join('products', 'products.id', '=', 'product_sales.product_id')
            ->leftJoin('units', 'units.id', '=', 'product_sales.sale_unit_id')
            ->whereBetween('sales.sale_date', [$start->toDateString(), $end->toDateString()])
            ->where('product_sales.product_id', $productId)
            ->selectRaw("
                sales.sale_date as date,
                customers.name as customer_name,
                products.name as product_name,
                COALESCE(units.unit_code, units.unit_name, '') as unit,
                product_sales.net_unit_price as unit_price,
                product_sales.qty,
                'Sales' as type,
                product_sales.total as amount,
                COALESCE(product_sales.total_cost, 0) as cost
            ");

        $returns = DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->join('customers', 'customers.id', '=', 'returns.customer_id')
            ->join('products', 'products.id', '=', 'product_returns.product_id')
            ->leftJoin('units', 'units.id', '=', 'product_returns.sale_unit_id')
            ->whereBetween('returns.return_date', [$start->toDateString(), $end->toDateString()])
            ->where('product_returns.product_id', $productId)
            ->selectRaw("
                returns.return_date as date,
                customers.name as customer_name,
                products.name as product_name,
                COALESCE(units.unit_code, units.unit_name, '') as unit,
                product_returns.net_unit_price as unit_price,
                product_returns.qty,
                'Return' as type,
                product_returns.total as amount,
                COALESCE(product_returns.total_cost, 0) as cost
            ");

        return $sales
            ->unionAll($returns)
            ->orderByDesc('date')
            ->get()
            ->values()
            ->map(fn ($row, int $index) => [
                'sl' => $index + 1,
                'date' => Carbon::parse($row->date)->format('d/m/Y'),
                'customer_name' => $row->customer_name,
                'product_name' => $row->product_name,
                'unit' => $row->unit,
                'unit_price' => $this->round((float) $row->unit_price),
                'qty' => $this->round((float) $row->qty),
                'type' => $row->type,
                'amount' => $this->round((float) $row->amount),
                'cost' => $this->round((float) $row->cost),
            ]);
    }

    private function company(): array
    {
        $settings = GeneralSetting::query()->first();

        return [
            'name' => $settings?->company_name ?: 'Vision Trade International',
            'address' => $settings?->company_address ?: '26/1, 26/2 Dr. Kudrot-E-Khuda Road, Eastern Mollika Shopping Complex, Elephant Road, Dhaka-1205.',
            'email' => $settings?->company_email ?: 'visioncosmetics82@gmail.com',
            'phone' => $settings?->company_phone ?: '01778284863',
        ];
    }

    private function numberToWords(int $number): string
    {
        if ($number === 0) {
            return 'zero';
        }

        $ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        $tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        $underThousand = function (int $value) use ($ones, $tens): string {
            $parts = [];

            if ($value >= 100) {
                $parts[] = $ones[intdiv($value, 100)].' hundred';
                $value %= 100;
            }

            if ($value >= 20) {
                $parts[] = $tens[intdiv($value, 10)];
                $value %= 10;
            }

            if ($value > 0) {
                $parts[] = $ones[$value];
            }

            return implode(' ', $parts);
        };

        $parts = [];

        foreach ([1000000000 => 'billion', 1000000 => 'million', 1000 => 'thousand'] as $value => $label) {
            if ($number >= $value) {
                $parts[] = $underThousand(intdiv($number, $value)).' '.$label;
                $number %= $value;
            }
        }

        if ($number > 0) {
            $parts[] = $underThousand($number);
        }

        return implode(' ', $parts);
    }

    private function round(float $value): float
    {
        return round($value, 2);
    }
}
