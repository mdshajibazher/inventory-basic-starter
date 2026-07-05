<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->string('bulksmsbd_api_url')->default('http://bulksmsbd.net/api/smsapi');
            $table->string('bulksmsbd_api_key')->nullable();
            $table->string('bulksmsbd_sender_id')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->dropColumn([
                'bulksmsbd_api_url',
                'bulksmsbd_api_key',
                'bulksmsbd_sender_id',
            ]);
        });
    }
};
