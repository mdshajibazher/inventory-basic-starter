<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class CashRegisterSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\CashRegister::insert(array(
            array('id' => '1','cash_in_hand' => '100','user_id' => '9','warehouse_id' => '1','status' => '0','created_at' => '2020-10-13 13:32:54','updated_at' => '2020-10-24 06:27:42'),
            array('id' => '2','cash_in_hand' => '50','user_id' => '9','warehouse_id' => '1','status' => '1','created_at' => '2020-10-13 21:25:26','updated_at' => '2020-10-13 21:25:26'),
            array('id' => '3','cash_in_hand' => '200','user_id' => '1','warehouse_id' => '1','status' => '1','created_at' => '2020-10-22 13:53:07','updated_at' => '2020-10-24 06:33:32'),
            array('id' => '4','cash_in_hand' => '100','user_id' => '1','warehouse_id' => '2','status' => '1','created_at' => '2020-10-24 07:04:39','updated_at' => '2020-10-24 07:04:39')
        ));
    }
}
