<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_sales', function (Blueprint $table) {
            $table->double('unit_cost')->default(0)->after('total');
            $table->double('total_cost')->default(0)->after('unit_cost');
        });

        Schema::table('product_returns', function (Blueprint $table) {
            $table->double('unit_cost')->default(0)->after('total');
            $table->double('total_cost')->default(0)->after('unit_cost');
        });

        $this->backfill('product_sales');
        $this->backfill('product_returns');
    }

    public function down(): void
    {
        Schema::table('product_sales', function (Blueprint $table) {
            $table->dropColumn(['unit_cost', 'total_cost']);
        });

        Schema::table('product_returns', function (Blueprint $table) {
            $table->dropColumn(['unit_cost', 'total_cost']);
        });
    }

    private function backfill(string $table): void
    {
        DB::table($table)
            ->join('products', 'products.id', '=', "{$table}.product_id")
            ->leftJoin('units', 'units.id', '=', "{$table}.sale_unit_id")
            ->orderBy("{$table}.id")
            ->select([
                "{$table}.id",
                "{$table}.qty",
                'products.cost',
                'units.operator',
                'units.operation_value',
            ])
            ->chunk(500, function ($rows) use ($table) {
                foreach ($rows as $row) {
                    $qty = (float) $row->qty;
                    $baseQuantity = $this->baseQuantity($qty, $row->operator, $row->operation_value);
                    $totalCost = round((float) $row->cost * $baseQuantity, 2);

                    DB::table($table)
                        ->where('id', $row->id)
                        ->update([
                            'unit_cost' => $qty > 0 ? round($totalCost / $qty, 2) : 0,
                            'total_cost' => $totalCost,
                        ]);
                }
            });
    }

    private function baseQuantity(float $qty, ?string $operator, mixed $operationValue): float
    {
        $value = (float) $operationValue;

        if ($operator === '*') {
            return $qty * $value;
        }

        if ($operator === '/' && $value !== 0.0) {
            return $qty / $value;
        }

        return $qty;
    }
};
