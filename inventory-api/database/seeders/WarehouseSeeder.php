<?php

namespace Database\Seeders;

use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class WarehouseSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $warehouses = [
            ['name' => 'Warehouse One', 'phone' => '01700000000', 'email' => 'info@warehouseone.com', 'address' => 'dhaka', 'is_active' => '1', 'created_at' => '2021-12-11 19:11:03', 'updated_at' => '2021-12-11 19:11:03'],
            ['name' => 'Warehouse Two', 'phone' => '01711111111', 'email' => 'info@warehousetwo.com', 'address' => 'chuadanga', 'is_active' => '1', 'created_at' => '2021-12-11 19:11:24', 'updated_at' => '2021-12-11 19:11:24'],
        ];

        foreach ($warehouses as $warehouse) {
            Warehouse::query()->updateOrCreate(
                ['email' => $warehouse['email']],
                $warehouse
            );
        }
    }
}
