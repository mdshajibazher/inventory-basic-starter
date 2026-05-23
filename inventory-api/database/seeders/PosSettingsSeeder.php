<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class PosSettingsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\PosSetting::insert(array(
            array('id' => '1','customer_id' => '11','warehouse_id' => '2','biller_id' => '1','product_number' => '4','keybord_active' => '0','stripe_public_key' => 'pk_test_ITN7KOYiIsHSCQ0UMRcgaYUB','stripe_secret_key' => 'sk_test_TtQQaawhEYRwa3mU9CzttrEy','created_at' => '2018-09-02 09:17:04','updated_at' => '2020-04-17 19:59:54')
        ));
    }
}
