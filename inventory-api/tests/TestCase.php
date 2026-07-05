<?php

namespace Tests;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createActivityLogTable();
    }

    private function createActivityLogTable(): void
    {
        if (Schema::hasTable(config('activitylog.table_name', 'activity_log'))) {
            return;
        }

        Schema::create(config('activitylog.table_name', 'activity_log'), function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('log_name')->nullable();
            $table->text('description');
            $table->nullableMorphs('subject', 'subject');
            $table->string('event')->nullable()->after('subject_type');
            $table->nullableMorphs('causer', 'causer');
            $table->json('properties')->nullable();
            $table->uuid('batch_uuid')->nullable()->after('properties');
            $table->timestamps();
            $table->index('log_name');
        });
    }
}
