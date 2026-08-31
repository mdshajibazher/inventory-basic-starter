<?php

namespace Tests\Unit;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class SalesInvoiceRevisionMigrationTest extends TestCase
{
    public function test_sale_foreign_key_matches_the_legacy_unsigned_integer_width_and_cascades(): void
    {
        $connection = DB::connection();
        $legacySales = new Blueprint($connection, 'sales');
        $legacySales->increments('id');
        $legacyId = collect($legacySales->getColumns())->firstWhere('name', 'id');

        Schema::shouldReceive('create')
            ->once()
            ->with('sales_invoice_revisions', Mockery::on(function (callable $definition) use ($connection, $legacyId): bool {
                $revisions = new Blueprint($connection, 'sales_invoice_revisions');
                $definition($revisions);

                $saleId = collect($revisions->getColumns())->firstWhere('name', 'sale_id');
                $foreign = collect($revisions->getCommands())
                    ->first(fn ($command): bool => $command->name === 'foreign' && $command->columns === ['sale_id']);

                $this->assertNotNull($saleId);
                $this->assertSame($legacyId->type, $saleId->type);
                $this->assertSame($legacyId->unsigned, $saleId->unsigned);
                $this->assertNotNull($foreign);
                $this->assertSame('id', $foreign->references);
                $this->assertSame('sales', $foreign->on);
                $this->assertSame('cascade', $foreign->onDelete);

                return true;
            }));

        $migration = require database_path('migrations/2026_08_30_000002_create_sales_invoice_revisions_table.php');
        $migration->up();
    }
}
