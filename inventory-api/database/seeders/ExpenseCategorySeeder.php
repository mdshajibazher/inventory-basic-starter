<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    public function run(): void
    {
        collect([
            ['code' => 'OFFICE', 'name' => 'Office expense'],
            ['code' => 'RENT', 'name' => 'Rent'],
            ['code' => 'UTILITY', 'name' => 'Utility'],
            ['code' => 'TRANSPORT', 'name' => 'Transport'],
        ])->each(function (array $category) {
            ExpenseCategory::query()->firstOrCreate(
                ['code' => $category['code']],
                ['name' => $category['name'], 'is_active' => true]
            );
        });
    }
}
