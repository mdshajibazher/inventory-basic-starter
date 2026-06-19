<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_stock_movements', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('product_id');
            $table->unsignedInteger('warehouse_id')->nullable();
            $table->unsignedBigInteger('product_batch_id')->nullable();
            $table->unsignedInteger('variant_id')->nullable();
            $table->unsignedInteger('unit_id')->nullable();
            $table->string('source_type')->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('type', 40);
            $table->double('quantity');
            $table->double('quantity_base');
            $table->double('before_quantity')->default(0);
            $table->double('after_quantity')->default(0);
            $table->string('reference_no')->nullable();
            $table->text('note')->nullable();
            $table->date('movement_date')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'created_at']);
            $table->index(['warehouse_id', 'product_id']);
            $table->index(['source_type', 'source_id']);
            $table->index(['type', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_stock_movements');
    }
};
