<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            foreach (['sales_invoice', 'return_invoice', 'purchase_invoice', 'payment'] as $type) {
                $table->boolean("{$type}_mail_notification_enabled")->default(false);
                $table->json("{$type}_mail_notification_user_ids")->nullable();
                $table->boolean("{$type}_sms_notification_enabled")->default(false);
                $table->json("{$type}_sms_notification_user_ids")->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $columns = [];

            foreach (['sales_invoice', 'return_invoice', 'purchase_invoice', 'payment'] as $type) {
                $columns[] = "{$type}_mail_notification_enabled";
                $columns[] = "{$type}_mail_notification_user_ids";
                $columns[] = "{$type}_sms_notification_enabled";
                $columns[] = "{$type}_sms_notification_user_ids";
            }

            $table->dropColumn($columns);
        });
    }
};
