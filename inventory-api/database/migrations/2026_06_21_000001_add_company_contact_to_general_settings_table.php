<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->string('company_name')->nullable()->after('site_title');
            $table->text('company_address')->nullable()->after('company_name');
            $table->string('company_email')->nullable()->after('company_address');
            $table->string('company_phone')->nullable()->after('company_email');
        });
    }

    public function down(): void
    {
        Schema::table('general_settings', function (Blueprint $table) {
            $table->dropColumn([
                'company_name',
                'company_address',
                'company_email',
                'company_phone',
            ]);
        });
    }
};
