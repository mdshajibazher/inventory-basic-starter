<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('impersonation_sessions', function (Blueprint $table): void {
            $table->id();
            // Retain identifiers for ownership and audit after users or tokens are removed.
            $table->unsignedBigInteger('actor_id')->index();
            $table->unsignedBigInteger('target_id')->index();
            $table->unsignedBigInteger('original_token_id')->index();
            $table->unsignedBigInteger('impersonation_token_id')->unique();
            $table->unsignedBigInteger('biller_id');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->index(['original_token_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('impersonation_sessions');
    }
};
