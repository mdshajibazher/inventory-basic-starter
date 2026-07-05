<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('current_biller_id')->nullable()->after('biller_id');
            $table->json('biller_ids')->nullable()->after('current_biller_id');
            $table->index('current_biller_id');
        });

        foreach (['purchases', 'return_purchases', 'expenses'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('biller_id')->nullable()->after('warehouse_id');
                $table->index('biller_id');
            });
        }

        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('biller_id')->nullable()->after('account_id');
            $table->index('biller_id');
        });

        $fallbackBillerId = DB::table('billers')->where('is_active', true)->orderBy('id')->value('id')
            ?? DB::table('billers')->orderBy('id')->value('id');

        DB::table('users')->orderBy('id')->chunkById(100, function ($users) use ($fallbackBillerId) {
            foreach ($users as $user) {
                $billerId = $user->biller_id ?: $fallbackBillerId;

                if (! $billerId) {
                    continue;
                }

                DB::table('users')->where('id', $user->id)->update([
                    'current_biller_id' => $billerId,
                    'biller_ids' => json_encode([(int) $billerId]),
                ]);
            }
        });

        DB::table('purchases')
            ->join('users', 'users.id', '=', 'purchases.user_id')
            ->whereNull('purchases.biller_id')
            ->update(['purchases.biller_id' => DB::raw('users.current_biller_id')]);

        DB::table('return_purchases')
            ->join('users', 'users.id', '=', 'return_purchases.user_id')
            ->whereNull('return_purchases.biller_id')
            ->update(['return_purchases.biller_id' => DB::raw('users.current_biller_id')]);

        DB::table('expenses')
            ->join('users', 'users.id', '=', 'expenses.user_id')
            ->whereNull('expenses.biller_id')
            ->update(['expenses.biller_id' => DB::raw('users.current_biller_id')]);

        $this->backfillPaymentBillers();
    }

    public function down(): void
    {
        foreach (['expenses', 'payments', 'return_purchases', 'purchases'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropIndex(['biller_id']);
                $table->dropColumn('biller_id');
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['current_biller_id']);
            $table->dropColumn(['current_biller_id', 'biller_ids']);
        });
    }

    private function backfillPaymentBillers(): void
    {
        DB::table('payments')
            ->leftJoin('sales', 'sales.id', '=', 'payments.sale_id')
            ->leftJoin('returns', 'returns.id', '=', 'payments.sale_return_id')
            ->leftJoin('purchases', 'purchases.id', '=', 'payments.purchase_id')
            ->leftJoin('return_purchases', 'return_purchases.id', '=', 'payments.purchase_return_id')
            ->leftJoin('users', 'users.id', '=', 'payments.user_id')
            ->whereNull('payments.biller_id')
            ->update([
                'payments.biller_id' => DB::raw('COALESCE(sales.biller_id, returns.biller_id, purchases.biller_id, return_purchases.biller_id, users.current_biller_id)'),
            ]);
    }
};
