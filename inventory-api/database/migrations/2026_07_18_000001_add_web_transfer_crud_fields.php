<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transfers', function (Blueprint $table) {
            $table->date('transfer_date')->nullable()->after('reference_no');
            $table->date('expected_delivery_date')->nullable()->after('to_warehouse_id');
            $table->unsignedBigInteger('requested_by')->nullable()->after('expected_delivery_date');
            $table->string('vehicle_courier')->nullable()->after('document');
            $table->string('driver_contact')->nullable()->after('vehicle_courier');
        });

        Schema::table('product_transfer', function (Blueprint $table) {
            $table->text('note')->nullable()->after('total');
        });
    }

    public function down(): void
    {
        Schema::table('product_transfer', function (Blueprint $table) {
            $table->dropColumn('note');
        });

        Schema::table('transfers', function (Blueprint $table) {
            $table->dropColumn([
                'transfer_date',
                'expected_delivery_date',
                'requested_by',
                'vehicle_courier',
                'driver_contact',
            ]);
        });
    }
};
