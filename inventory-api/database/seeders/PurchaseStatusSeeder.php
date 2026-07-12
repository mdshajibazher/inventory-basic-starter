<?php

namespace Database\Seeders;

use App\Models\PurchaseStatus;
use Illuminate\Database\Seeder;

class PurchaseStatusSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->statuses() as $status) {
            PurchaseStatus::query()->updateOrCreate(
                ['value' => $status['value']],
                [
                    'value' => $status['value'],
                    'label' => $status['label'],
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
        ];
    }
}
