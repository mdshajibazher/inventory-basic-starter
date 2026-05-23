<?php

namespace Database\Seeders;

use App\Models\Brand;
use Illuminate\Database\Seeder;

class DummyBrandSeeder extends Seeder
{
    public function run(): void
    {
        for ($i = 1; $i <= 1000; $i++) {
            Brand::query()->updateOrCreate(
                ['title' => sprintf('Dummy Brand %04d', $i)],
                [
                    'image' => null,
                    'is_active' => true,
                ]
            );
        }
    }
}
