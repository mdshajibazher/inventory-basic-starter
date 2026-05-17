<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Inventory Admin',
                'password' => 'password',
                'phone' => '01700817934'
            ]
        );

        $drinks = Category::query()->firstOrCreate(
            ['name' => 'Drinks'],
            ['is_active' => true]
        );

        $office = Category::query()->firstOrCreate(
            ['name' => 'Office Supplies'],
            ['is_active' => true]
        );

        // Product::query()->firstOrCreate(
        //     ['sku' => 'COKE-500'],
        //     [
        //         'category_id' => $drinks->id,
        //         'name' => 'Coca-Cola 500ml',
        //         'barcode' => '100000000001',
        //         'purchase_price' => 35,
        //         'selling_price' => 45,
        //         'quantity' => 20,
        //         'low_stock_limit' => 5,
        //         'description' => 'Demo product',
        //     ]
        // );

        // Product::query()->firstOrCreate(
        //     ['sku' => 'PAPER-A4'],
        //     [
        //         'category_id' => $office->id,
        //         'name' => 'A4 Paper Ream',
        //         'barcode' => '100000000002',
        //         'purchase_price' => 420,
        //         'selling_price' => 500,
        //         'quantity' => 4,
        //         'low_stock_limit' => 5,
        //         'description' => 'Low-stock demo product',
        //     ]
        // );
    }
}
