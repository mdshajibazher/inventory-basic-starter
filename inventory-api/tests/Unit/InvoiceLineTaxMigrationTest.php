<?php

namespace Tests\Unit;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class InvoiceLineTaxMigrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        foreach (['product_sales', 'product_returns'] as $tableName) {
            Schema::create($tableName, function (Blueprint $table) {
                $table->id();
                $table->double('tax_rate');
            });
        }
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('product_returns');
        Schema::dropIfExists('product_sales');

        parent::tearDown();
    }

    public function test_tax_method_snapshots_can_be_added_and_rolled_back(): void
    {
        $migration = require database_path('migrations/2026_08_30_000001_add_tax_method_to_sales_return_lines.php');

        $migration->up();

        $this->assertTrue(Schema::hasColumn('product_sales', 'tax_method'));
        $this->assertTrue(Schema::hasColumn('product_returns', 'tax_method'));

        $migration->down();

        $this->assertFalse(Schema::hasColumn('product_sales', 'tax_method'));
        $this->assertFalse(Schema::hasColumn('product_returns', 'tax_method'));
    }
}
