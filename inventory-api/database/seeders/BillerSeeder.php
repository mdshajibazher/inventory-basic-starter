<?php

namespace Database\Seeders;

use App\Models\Biller;
use Illuminate\Database\Seeder;

class BillerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $billers = [
            ['name' => 'Biller One', 'image' => 'aks.jpg', 'company_name' => 'aks', 'vat_number' => '31123', 'email' => 'yousuf@kds.com', 'phone_number' => '01722335544', 'address' => 'halishahar', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'sdgs', 'is_active' => '1', 'created_at' => '2018-05-13 03:49:30', 'updated_at' => '2019-03-02 11:20:38'],
            ['name' => 'Biller Two', 'image' => null, 'company_name' => 'big tree', 'vat_number' => null, 'email' => 'tariq@bigtree.com', 'phone_number' => '01766554477', 'address' => 'khulshi', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '1', 'created_at' => '2018-05-13 03:57:54', 'updated_at' => '2018-06-15 06:07:11'],
            ['name' => 'Biller Three', 'image' => null, 'company_name' => 'test', 'vat_number' => null, 'email' => 'test@test.com', 'phone_number' => '01744999999', 'address' => 'erewrwqre', 'city' => 'afsf', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '0', 'created_at' => '2018-05-30 08:38:58', 'updated_at' => '2018-05-30 08:39:57'],
            ['name' => 'Biller Four', 'image' => 'mogaTel.jpg', 'company_name' => 'mogaTel', 'vat_number' => '', 'email' => 'modon@gmail.com', 'phone_number' => '01466555555', 'address' => 'nasirabad', 'city' => 'chittagong', 'state' => '', 'postal_code' => '', 'country' => 'bd', 'is_active' => '1', 'created_at' => '2018-09-01 09:59:54', 'updated_at' => '2018-10-07 08:35:51'],
            ['name' => 'Biller Five', 'image' => null, 'company_name' => 'a', 'vat_number' => null, 'email' => 'a@a.com', 'phone_number' => '01755664477', 'address' => 'q', 'city' => 'q', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '0', 'created_at' => '2018-10-07 08:33:39', 'updated_at' => '2018-10-07 08:34:18'],
            ['name' => 'Biller Six', 'image' => null, 'company_name' => 'a', 'vat_number' => null, 'email' => 'a@a.com', 'phone_number' => '01766998844', 'address' => 'a', 'city' => 'a', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '0', 'created_at' => '2018-10-07 08:34:36', 'updated_at' => '2018-10-07 08:36:07'],
            ['name' => 'Biller Seven', 'image' => 'x.png', 'company_name' => 'x', 'vat_number' => null, 'email' => 'x@x.com', 'phone_number' => '01766994455', 'address' => 'x', 'city' => 'x', 'state' => null, 'postal_code' => null, 'country' => null, 'is_active' => '1', 'created_at' => '2019-03-18 17:02:42', 'updated_at' => '2019-12-21 17:01:24'],
        ];

        foreach ($billers as $biller) {
            Biller::query()->updateOrCreate(
                ['name' => $biller['name']],
                $biller
            );
        }
    }
}
