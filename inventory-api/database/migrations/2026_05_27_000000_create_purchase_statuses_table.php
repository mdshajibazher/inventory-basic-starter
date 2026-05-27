<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePurchaseStatusesTable extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_statuses', function (Blueprint $table) {
            $table->increments('id');
            $table->string('value')->unique();
            $table->string('label');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_statuses');
    }
}
