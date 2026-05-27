<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PurchaseStatusSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->statuses() as $status) {
            DB::table('purchase_statuses')->updateOrInsert(
                ['value' => $status['value']],
                [
                    'id' => (int) $status['value'],
                    'label' => $status['label'],
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }

    private function statuses(): array
    {
        return [
            ['value' => '1', 'label' => 'Received'],
            ['value' => '2', 'label' => 'Partial'],
            ['value' => '3', 'label' => 'Pending'],
            ['value' => '4', 'label' => 'Ordered'],
        ];
    }
}
