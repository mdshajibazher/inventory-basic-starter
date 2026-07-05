<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->json('sales_invoice_approver_ids')->nullable()->after('company_phone');
            $table->json('return_invoice_approver_ids')->nullable()->after('sales_invoice_approver_ids');
            $table->json('purchase_invoice_approver_ids')->nullable()->after('return_invoice_approver_ids');
            $table->json('payment_approver_ids')->nullable()->after('purchase_invoice_approver_ids');
        });

        foreach (['sales', 'returns', 'purchases', 'payments'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->string('approval_status')->default('approved')->after('updated_at');
                $table->unsignedBigInteger('approved_by')->nullable()->after('approval_status');
                $table->timestamp('approved_at')->nullable()->after('approved_by');
                $table->index('approval_status');
            });

            DB::table($tableName)->update([
                'approval_status' => 'approved',
                'approved_at' => DB::raw('updated_at'),
            ]);
        }

        Schema::table('product_purchases', function (Blueprint $table) {
            $table->string('batch_no')->nullable()->after('variant_id');
            $table->date('expired_date')->nullable()->after('batch_no');
        });
    }

    public function down(): void
    {
        Schema::table('product_purchases', function (Blueprint $table) {
            $table->dropColumn(['batch_no', 'expired_date']);
        });

        foreach (['sales', 'returns', 'purchases', 'payments'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropIndex($table->getTable().'_approval_status_index');
                $table->dropColumn(['approval_status', 'approved_by', 'approved_at']);
            });
        }

        Schema::table('general_settings', function (Blueprint $table) {
            $table->dropColumn([
                'sales_invoice_approver_ids',
                'return_invoice_approver_ids',
                'purchase_invoice_approver_ids',
                'payment_approver_ids',
            ]);
        });
    }
};
