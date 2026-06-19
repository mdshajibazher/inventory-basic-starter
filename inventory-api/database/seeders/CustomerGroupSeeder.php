<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class CustomerGroupSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\CustomerGroup::upsert(array(
            array('id' => '1','name' => 'Zero Group','percentage' => '0','is_active' => '1','created_at' => '2021-12-11 18:53:10','updated_at' => '2021-12-11 18:54:06'),
            array('id' => '2','name' => 'Ten Percent Group','percentage' => '10','is_active' => '1','created_at' => '2021-12-11 18:54:29','updated_at' => '2021-12-11 18:54:29'),
            array('id' => '3','name' => 'Twenty Percent Group','percentage' => '20','is_active' => '1','created_at' => '2021-12-11 18:54:47','updated_at' => '2021-12-11 18:54:47')
        ));
    }
}
