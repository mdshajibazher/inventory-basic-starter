<?php

namespace Database\Seeders;
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
        \App\Supplier::insert(array(
            array('id' => '1','name' => 'Supplier One','image' => 'globaltouch.jpg','company_name' => 'Global Touch','vat_number' => NULL,'email' => 'abdullah@globaltouch.com','phone_number' => '231231','address' => 'fsdfs','city' => 'fsdfs','state' => NULL,'postal_code' => NULL,'country' => 'bd','is_active' => '1','created_at' => '2018-05-13 04:06:34','updated_at' => '2019-12-21 16:58:47'),
            array('id' => '2','name' => 'Supplier Two','image' => 'lion.jpg','company_name' => 'lion','vat_number' => NULL,'email' => 'lion@gmail.com','phone_number' => '242','address' => 'gfdg','city' => 'fgd','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '0','created_at' => '2018-05-30 05:59:41','updated_at' => '2018-05-30 06:00:06'),
            array('id' => '3','name' => 'Supplier Three','image' => NULL,'company_name' => 'techbd','vat_number' => NULL,'email' => 'ismail@test.com','phone_number' => '23123123','address' => 'mohammadpur','city' => 'dhaka','state' => NULL,'postal_code' => NULL,'country' => 'bangladesh','is_active' => '1','created_at' => '2018-07-20 10:34:17','updated_at' => '2018-07-20 10:34:17'),
            array('id' => '4','name' => 'Supplier Four','image' => 'mogaFruit.jpg','company_name' => 'mogaFruit','vat_number' => NULL,'email' => 'modon@gmail.com','phone_number' => '32321','address' => 'nasirabad','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'bd','is_active' => '0','created_at' => '2018-09-01 10:30:07','updated_at' => '2018-09-01 10:37:20'),
            array('id' => '5','name' => 'Supplier Five','image' => NULL,'company_name' => 'anda boda','vat_number' => 'dsa','email' => 'asd@dsa.com','phone_number' => '3212313','address' => 'dadas','city' => 'sdad','state' => 'Other','postal_code' => '1312','country' => 'Australia','is_active' => '0','created_at' => '2020-06-22 15:48:33','updated_at' => '2020-06-22 15:48:52')
        ));
    }
}
