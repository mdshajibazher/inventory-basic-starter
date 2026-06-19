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
            $table->date('date')->nullable()->after('sale_id');
        });

        Schema::table('product_purchases', function (Blueprint $table) {
            $table->date('date')->nullable()->after('purchase_id');
        });

        Schema::table('product_returns', function (Blueprint $table) {
            $table->date('date')->nullable()->after('return_id');
        });

        DB::table('product_sales')
            ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
            ->whereNull('product_sales.date')
            ->update(['product_sales.date' => DB::raw('sales.sale_date')]);

        DB::table('product_purchases')
            ->join('purchases', 'purchases.id', '=', 'product_purchases.purchase_id')
            ->whereNull('product_purchases.date')
            ->update(['product_purchases.date' => DB::raw('purchases.purchase_date')]);

        DB::table('product_returns')
            ->join('returns', 'returns.id', '=', 'product_returns.return_id')
            ->whereNull('product_returns.date')
            ->update(['product_returns.date' => DB::raw('returns.return_date')]);
    }

    public function down(): void
    {
        Schema::table('product_returns', function (Blueprint $table) {
            $table->dropColumn('date');
        });

        Schema::table('product_purchases', function (Blueprint $table) {
            $table->dropColumn('date');
        });

        Schema::table('product_sales', function (Blueprint $table) {
            $table->dropColumn('date');
        });
    }
};
