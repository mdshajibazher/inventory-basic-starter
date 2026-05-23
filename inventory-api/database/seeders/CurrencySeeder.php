<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class CurrencySeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Currency::insert(array(
            array('id' => '1','name' => 'Bangladeshi Taka','code' => 'BDT','exchange_rate' => '1','created_at' => '2021-12-11 11:22:47','updated_at' => '2021-12-11 11:22:47'),
            array('id' => '2','name' => 'America Dollar','code' => 'USD','exchange_rate' => '80','created_at' => '2021-12-11 20:28:26','updated_at' => '2021-12-11 20:28:26')
        ));
    }
}
