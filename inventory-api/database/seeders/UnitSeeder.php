<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Models\Unit::upsert(array(
            array('unit_code' => 'pc','unit_name' => 'Piece','base_unit' => NULL,'operator' => '*','operation_value' => '1','is_active' => '1','created_at' => '2018-05-12 08:27:46','updated_at' => '2018-08-18 03:41:53'),
            array('unit_code' => 'dozen','unit_name' => 'dozen box','base_unit' => '1','operator' => '*','operation_value' => '12','is_active' => '1','created_at' => '2018-05-12 15:57:05','updated_at' => '2018-05-12 15:57:05'),
            array('unit_code' => 'cartoon','unit_name' => 'cartoon box','base_unit' => '1','operator' => '*','operation_value' => '24','is_active' => '1','created_at' => '2018-05-12 15:57:45','updated_at' => '2020-03-11 16:36:59'),
            array('unit_code' => 'ml','unit_name' => 'Mililiter','base_unit' => NULL,'operator' => '*','operation_value' => '1','is_active' => '1','created_at' => '2018-05-12 15:58:07','updated_at' => '2018-05-28 05:20:57'),
            array('unit_code' => 'cartoon','unit_name' => 'Cartoon','base_unit' => NULL,'operator' => '*','operation_value' => '1','is_active' => '0','created_at' => '2018-05-28 05:20:20','updated_at' => '2018-05-28 05:20:25'),
            array('unit_code' => 'kg','unit_name' => 'kilogram','base_unit' => NULL,'operator' => '*','operation_value' => '1','is_active' => '1','created_at' => '2018-06-25 06:49:26','updated_at' => '2018-06-25 06:49:26'),
            array('unit_code' => 'ounce','unit_name' => 'Ounce','base_unit' => '8','operator' => '*','operation_value' => '1','is_active' => '0','created_at' => '2018-08-01 04:35:51','updated_at' => '2018-08-01 04:40:54'),
            array('unit_code' => 'gm','unit_name' => 'gram','base_unit' => '7','operator' => '/','operation_value' => '1000','is_active' => '1','created_at' => '2018-09-01 06:06:28','updated_at' => '2018-09-01 06:06:28'),
            array('unit_code' => 'gz','unit_name' => 'goz','base_unit' => NULL,'operator' => '*','operation_value' => '1','is_active' => '0','created_at' => '2018-11-29 09:40:29','updated_at' => '2019-03-02 17:53:29')
        ),
        ['unit_code']
    );
    }
}
