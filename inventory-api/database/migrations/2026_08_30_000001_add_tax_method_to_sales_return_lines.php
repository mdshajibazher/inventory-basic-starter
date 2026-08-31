<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_sales', function (Blueprint $table) {
            $table->unsignedTinyInteger('tax_method')->nullable()->after('tax_rate');
        });

        Schema::table('product_returns', function (Blueprint $table) {
            $table->unsignedTinyInteger('tax_method')->nullable()->after('tax_rate');
        });
    }

    public function down(): void
    {
        Schema::table('product_sales', function (Blueprint $table) {
            $table->dropColumn('tax_method');
        });

        Schema::table('product_returns', function (Blueprint $table) {
            $table->dropColumn('tax_method');
        });
    }
};
