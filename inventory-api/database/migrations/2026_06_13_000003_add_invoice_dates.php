<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->date('sale_date')->nullable()->after('reference_no');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->date('purchase_date')->nullable()->after('reference_no');
        });

        Schema::table('returns', function (Blueprint $table) {
            $table->date('return_date')->nullable()->after('reference_no');
        });

        DB::table('sales')->whereNull('sale_date')->update(['sale_date' => DB::raw('DATE(created_at)')]);
        DB::table('purchases')->whereNull('purchase_date')->update(['purchase_date' => DB::raw('DATE(created_at)')]);
        DB::table('returns')->whereNull('return_date')->update(['return_date' => DB::raw('DATE(created_at)')]);
    }

    public function down(): void
    {
        Schema::table('returns', function (Blueprint $table) {
            $table->dropColumn('return_date');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn('purchase_date');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('sale_date');
        });
    }
};
