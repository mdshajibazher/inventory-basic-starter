<?php

namespace Database\Seeders;
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
        \App\Biller::insert(array(
            array('id' => '1','name' => 'Biller One','image' => 'aks.jpg','company_name' => 'aks','vat_number' => '31123','email' => 'yousuf@kds.com','phone_number' => '01722335544','address' => 'halishahar','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'sdgs','is_active' => '1','created_at' => '2018-05-13 03:49:30','updated_at' => '2019-03-02 11:20:38'),
            array('id' => '2','name' => 'Biller Two','image' => NULL,'company_name' => 'big tree','vat_number' => NULL,'email' => 'tariq@bigtree.com','phone_number' => '01766554477','address' => 'khulshi','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '1','created_at' => '2018-05-13 03:57:54','updated_at' => '2018-06-15 06:07:11'),
            array('id' => '3','name' => 'Biller Three','image' => NULL,'company_name' => 'test','vat_number' => NULL,'email' => 'test@test.com','phone_number' => '01744999999','address' => 'erewrwqre','city' => 'afsf','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '0','created_at' => '2018-05-30 08:38:58','updated_at' => '2018-05-30 08:39:57'),
            array('id' => '5','name' => 'Biller Four','image' => 'mogaTel.jpg','company_name' => 'mogaTel','vat_number' => '','email' => 'modon@gmail.com','phone_number' => '01466555555','address' => 'nasirabad','city' => 'chittagong','state' => '','postal_code' => '','country' => 'bd','is_active' => '1','created_at' => '2018-09-01 09:59:54','updated_at' => '2018-10-07 08:35:51'),
            array('id' => '6','name' => 'Biller Five','image' => NULL,'company_name' => 'a','vat_number' => NULL,'email' => 'a@a.com','phone_number' => '01755664477','address' => 'q','city' => 'q','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '0','created_at' => '2018-10-07 08:33:39','updated_at' => '2018-10-07 08:34:18'),
            array('id' => '7','name' => 'Biller Six','image' => NULL,'company_name' => 'a','vat_number' => NULL,'email' => 'a@a.com','phone_number' => '01766998844','address' => 'a','city' => 'a','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '0','created_at' => '2018-10-07 08:34:36','updated_at' => '2018-10-07 08:36:07'),
            array('id' => '8','name' => 'Biller Seven','image' => 'x.png','company_name' => 'x','vat_number' => NULL,'email' => 'x@x.com','phone_number' => '01766994455','address' => 'x','city' => 'x','state' => NULL,'postal_code' => NULL,'country' => NULL,'is_active' => '1','created_at' => '2019-03-18 17:02:42','updated_at' => '2019-12-21 17:01:24')
        ));
    }
}
