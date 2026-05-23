<?php

namespace Database\Seeders;
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
        \App\Models\Warehouse::insert(array(
            array('name' => 'Warehouse One','phone' => '01700000000','email' => 'info@warehouseone.com','address' => 'dhaka','is_active' => '1','created_at' => '2021-12-11 19:11:03','updated_at' => '2021-12-11 19:11:03'),
            array('name' => 'Warehouse Two','phone' => '01711111111','email' => 'info@warehousetwo.com','address' => 'chuadanga','is_active' => '1','created_at' => '2021-12-11 19:11:24','updated_at' => '2021-12-11 19:11:24')
        ));
    }
}
