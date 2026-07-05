<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('user_id')->nullable()->index();
            $table->string('phone_number');
            $table->text('message');
            $table->string('status')->index();
            $table->string('provider')->nullable();
            $table->text('provider_response')->nullable();
            $table->string('record_type')->nullable();
            $table->integer('record_id')->nullable();
            $table->timestamps();

            $table->index(['record_type', 'record_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
