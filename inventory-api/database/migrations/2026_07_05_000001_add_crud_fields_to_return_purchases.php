<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('return_purchases', function (Blueprint $table) {
            $table->date('return_date')->nullable()->after('reference_no');
            $table->string('approval_status')->default('approved')->after('updated_at');
            $table->unsignedBigInteger('approved_by')->nullable()->after('approval_status');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->index('approval_status');
        });

        Schema::table('purchase_product_return', function (Blueprint $table) {
            $table->date('date')->nullable()->after('return_id');
        });

        DB::table('return_purchases')->whereNull('return_date')->update([
            'return_date' => DB::raw('DATE(created_at)'),
            'approval_status' => 'approved',
            'approved_at' => DB::raw('updated_at'),
        ]);

        DB::table('purchase_product_return')
            ->join('return_purchases', 'return_purchases.id', '=', 'purchase_product_return.return_id')
            ->whereNull('purchase_product_return.date')
            ->update(['purchase_product_return.date' => DB::raw('return_purchases.return_date')]);
    }

    public function down(): void
    {
        Schema::table('purchase_product_return', function (Blueprint $table) {
            $table->dropColumn('date');
        });

        Schema::table('return_purchases', function (Blueprint $table) {
            $table->dropIndex($table->getTable().'_approval_status_index');
            $table->dropColumn(['return_date', 'approval_status', 'approved_by', 'approved_at']);
        });
    }
};
