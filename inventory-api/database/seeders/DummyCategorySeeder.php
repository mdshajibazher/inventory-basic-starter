<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class DummyCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categoryIds = [];

        for ($i = 1; $i <= 1000; $i++) {
            $parentId = null;

            if ($i > 1 && $i % 3 !== 0) {
                $parentId = $categoryIds[array_rand($categoryIds)];
            }

            $category = Category::query()->updateOrCreate(
                ['name' => sprintf('Dummy Category %04d', $i)],
                [
                    'parent_id' => $parentId,
                    'is_active' => true,
                ]
            );

            $categoryIds[] = $category->id;
        }
    }
}
