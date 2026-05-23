<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class GeneralSettingsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\GeneralSetting::insert([
            [
                'id' => '1',
                'site_title' => 'Inventory Management',
                'site_logo' => '20211211111952.png',
                'currency' => '1',
                'staff_access' => 'own',
                'date_format' => 'd/m/Y',
                'developed_by' => 'LionCoders',
                'invoice_format' => 'standard',
                'state' => '1',
                'theme' => 'default.css',
                'created_at' => '2018-07-06 12:13:11',
                'updated_at' => '2021-12-11 20:12:49',
                'currency_position' => 'prefix'
            ]
        ]);
    }
}
