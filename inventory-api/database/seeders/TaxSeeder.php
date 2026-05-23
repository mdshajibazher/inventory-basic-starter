<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class TaxSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Models\Tax::insert(array(
            array('id' => '1','name' => 'vat@10','rate' => '10','is_active' => '1','created_at' => '2018-05-12 15:58:30','updated_at' => '2019-03-02 17:46:10'),
            array('id' => '2','name' => 'vat@15','rate' => '15','is_active' => '1','created_at' => '2018-05-12 15:58:43','updated_at' => '2018-05-28 05:35:05'),
            array('id' => '3','name' => 'vat@6','rate' => '6','is_active' => '0','created_at' => '2018-05-28 05:32:54','updated_at' => '2018-05-28 05:34:44'),
            array('id' => '4','name' => 'vat@20','rate' => '20','is_active' => '1','created_at' => '2018-09-01 06:58:57','updated_at' => '2018-09-01 06:58:57')
        ));
    }
}
