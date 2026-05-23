<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class AccountSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Account::insert(array(
            array('id' => '1','account_no' => '11225544','name' => 'Account 1','initial_balance' => '0','total_balance' => '0','note' => NULL,'is_default' => '1','is_active' => '1','created_at' => '2018-12-18 08:58:02','updated_at' => '2019-01-20 15:59:06'),
            array('id' => '2','account_no' => '22334455','name' => 'Account 2','initial_balance' => '0','total_balance' => '0','note' => NULL,'is_default' => '0','is_active' => '1','created_at' => '2018-12-18 08:58:56','updated_at' => '2019-01-20 15:59:06')
        ));
    }
}
