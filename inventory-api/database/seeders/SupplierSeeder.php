<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $suppliers = [
            ['name' => 'Supplier One', 'image' => 'globaltouch.jpg', 'company_name' => 'Global Touch', 'vat_number' => null, 'email' => 'abdullah@globaltouch.com', 'phone_number' => '231231', 'address' => 'fsdfs', 'city' => 'fsdfs', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'is_active' => '1', 'created_at' => '2018-05-13 04:06:34', 'updated_at' => '2019-12-21 16:58:47'],
            ['name' => 'Supplier Two', 'image' => 'lion.jpg', 'company_name' => 'lion', 'vat_number' => null, 'email' => 'lion@gmail.com', 'phone_number' => '242', 'address' => 'gfdg', 'city' => 'fgd', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '0', 'created_at' => '2018-05-30 05:59:41', 'updated_at' => '2018-05-30 06:00:06'],
            ['name' => 'Supplier Three', 'image' => null, 'company_name' => 'techbd', 'vat_number' => null, 'email' => 'ismail@test.com', 'phone_number' => '23123123', 'address' => 'mohammadpur', 'city' => 'dhaka', 'state' => null, 'postal_code' => null, 'country' => 'bangladesh', 'is_active' => '1', 'created_at' => '2018-07-20 10:34:17', 'updated_at' => '2018-07-20 10:34:17'],
            ['name' => 'Supplier Four', 'image' => 'mogaFruit.jpg', 'company_name' => 'mogaFruit', 'vat_number' => null, 'email' => 'modon@gmail.com', 'phone_number' => '32321', 'address' => 'nasirabad', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'is_active' => '0', 'created_at' => '2018-09-01 10:30:07', 'updated_at' => '2018-09-01 10:37:20'],
            ['name' => 'Supplier Five', 'image' => null, 'company_name' => 'anda boda', 'vat_number' => 'dsa', 'email' => 'asd@dsa.com', 'phone_number' => '3212313', 'address' => 'dadas', 'city' => 'sdad', 'state' => 'Other', 'postal_code' => '1312', 'country' => 'Australia', 'is_active' => '0', 'created_at' => '2020-06-22 15:48:33', 'updated_at' => '2020-06-22 15:48:52'],
        ];

        foreach ($suppliers as $supplier) {
            Supplier::query()->updateOrCreate(
                ['name' => $supplier['name']],
                $supplier
            );
        }
    }
}
