<?php

namespace Database\Seeders;

use App\Models\UnitGroup;
use Illuminate\Database\Seeder;

class UnitGroupSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['weight', 'volume', 'count', 'length'] as $title) {
            UnitGroup::query()->firstOrCreate(['title' => $title]);
        }
    }
}
