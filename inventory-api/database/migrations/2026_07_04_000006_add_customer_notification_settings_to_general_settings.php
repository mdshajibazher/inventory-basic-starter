<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->boolean('customer_sales_invoice_sms_notification_enabled')->default(false);
            $table->boolean('customer_sales_invoice_mail_notification_enabled')->default(false);
            $table->boolean('customer_return_invoice_sms_notification_enabled')->default(false);
            $table->boolean('customer_return_invoice_mail_notification_enabled')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->dropColumn([
                'customer_sales_invoice_sms_notification_enabled',
                'customer_sales_invoice_mail_notification_enabled',
                'customer_return_invoice_sms_notification_enabled',
                'customer_return_invoice_mail_notification_enabled',
            ]);
        });
    }
};
