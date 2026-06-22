<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->integer('customer_id')->nullable()->after('account_id');
            $table->integer('supplier_id')->nullable()->after('customer_id');
            $table->integer('sale_return_id')->nullable()->after('sale_id');
            $table->integer('purchase_return_id')->nullable()->after('sale_return_id');
            $table->string('payment_type')->nullable()->after('payment_reference');
            $table->string('direction')->nullable()->after('payment_type');

            $table->index('customer_id');
            $table->index('supplier_id');
            $table->index('sale_return_id');
            $table->index('purchase_return_id');
            $table->index(['account_id', 'created_at']);
            $table->index(['payment_type', 'direction']);
        });

        DB::table('payments')
            ->whereNotNull('sale_id')
            ->orderBy('id')
            ->chunkById(100, function ($payments) {
                foreach ($payments as $payment) {
                    $customerId = DB::table('sales')->where('id', $payment->sale_id)->value('customer_id');

                    if (! $customerId) {
                        continue;
                    }

                    DB::table('payments')
                        ->where('id', $payment->id)
                        ->update([
                            'customer_id' => $customerId,
                            'payment_type' => 'sale_payment',
                            'direction' => 'in',
                        ]);
                }
            });

        DB::table('payments')
            ->whereNotNull('purchase_id')
            ->orderBy('id')
            ->chunkById(100, function ($payments) {
                foreach ($payments as $payment) {
                    $supplierId = DB::table('purchases')->where('id', $payment->purchase_id)->value('supplier_id');

                    if (! $supplierId) {
                        continue;
                    }

                    DB::table('payments')
                        ->where('id', $payment->id)
                        ->update([
                            'supplier_id' => $supplierId,
                            'payment_type' => 'purchase_payment',
                            'direction' => 'out',
                        ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['customer_id']);
            $table->dropIndex(['supplier_id']);
            $table->dropIndex(['sale_return_id']);
            $table->dropIndex(['purchase_return_id']);
            $table->dropIndex(['account_id', 'created_at']);
            $table->dropIndex(['payment_type', 'direction']);

            $table->dropColumn([
                'customer_id',
                'supplier_id',
                'sale_return_id',
                'purchase_return_id',
                'payment_type',
                'direction',
            ]);
        });
    }
};
