<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_invoice_revisions', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('sale_id');
            $table->foreign('sale_id')->references('id')->on('sales')->cascadeOnDelete();
            $table->unsignedInteger('revision_number');
            $table->string('kind', 16);
            $table->json('before_snapshot')->nullable();
            $table->json('after_snapshot');
            $table->json('changes')->nullable();
            $table->string('recipient_email')->nullable();
            $table->string('delivery_status', 16)->default('pending')->index();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('queued_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->text('failure_message')->nullable();
            $table->timestamps();
            $table->unique(['sale_id', 'revision_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_invoice_revisions');
    }
};
