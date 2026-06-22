<?php

namespace Database\Seeders;

use App\Models\GeneralSetting;
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
        GeneralSetting::query()->updateOrCreate(
            ['id' => 1],
            [
                'site_title' => 'Inventory Management',
                'company_name' => 'Vision Trade International',
                'company_address' => '26/1, 26/2 Dr. Kudrot-E-Khuda Road, Eastern Mollika Shopping Complex, Elephant Road, Dhaka-1205.',
                'company_email' => 'visioncosmetics82@gmail.com',
                'company_phone' => '01778284863',
                'site_logo' => '20211211111952.png',
                'currency' => '1',
                'staff_access' => 'own',
                'date_format' => 'd/m/Y',
                'developed_by' => 'LionCoders',
                'invoice_format' => 'standard',
                'state' => '1',
                'theme' => 'default.css',
                'currency_position' => 'prefix',
            ]
        );
    }
}
