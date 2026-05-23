<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Customer::insert(array(
            array('id' => '1','customer_group_id' => '1','user_id' => '22','name' => 'Customer One','company_name' => 'lioncoders','email' => 'dhiman@gmail.com','phone_number' => '01451111101','tax_no' => NULL,'address' => 'kajir deuri','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'bd','deposit' => '190','expense' => '20','is_active' => '1','created_at' => '2018-05-12 16:00:48','updated_at' => '2021-04-12 13:36:17'),
            array('id' => '2','customer_group_id' => '2','user_id' => NULL,'name' => 'Customer Two','company_name' => 'lioncoders','email' => NULL,'phone_number' => '01200000001','tax_no' => NULL,'address' => 'jamalkhan','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'bd','deposit' => '100','expense' => '20','is_active' => '1','created_at' => '2018-05-12 16:04:51','updated_at' => '2019-02-22 11:38:08'),
            array('id' => '3','customer_group_id' => '2','user_id' => NULL,'name' => 'Customer Three','company_name' => 'big tree','email' => NULL,'phone_number' => '0165458452','tax_no' => NULL,'address' => 'khulshi','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'bd','deposit' => NULL,'expense' => NULL,'is_active' => '1','created_at' => '2018-05-12 16:07:52','updated_at' => '2019-03-02 11:54:07'),
            array('id' => '4','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Four','company_name' => NULL,'email' => NULL,'phone_number' => '01444556699','tax_no' => NULL,'address' => 'frwerw','city' => 'qwerwqr','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2018-05-30 07:35:28','updated_at' => '2018-05-30 07:37:38'),
            array('id' => '8','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Five','company_name' => 'smart it','email' => 'anwar@smartit.com','phone_number' => '01766544854','tax_no' => NULL,'address' => 'nasirabad','city' => 'chittagong','state' => NULL,'postal_code' => NULL,'country' => 'bd','deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2018-09-01 09:26:13','updated_at' => '2018-09-01 09:29:55'),
            array('id' => '11','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Six','company_name' => NULL,'email' => '','phone_number' => '01923000001','tax_no' => '01655448899','address' => 'mohammadpur','city' => 'dhaka','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => '0','is_active' => '1','created_at' => '2018-09-02 07:30:54','updated_at' => '2020-07-27 20:28:19'),
            array('id' => '15','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Seven','company_name' => NULL,'email' => NULL,'phone_number' => '01566669944','tax_no' => NULL,'address' => 's','city' => '3e','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2018-11-05 10:00:39','updated_at' => '2018-11-08 09:37:08'),
            array('id' => '16','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Eight','company_name' => NULL,'email' => NULL,'phone_number' => '01799999944','tax_no' => NULL,'address' => 'dasd','city' => 'asdd','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2018-12-01 06:07:53','updated_at' => '2018-12-04 03:55:46'),
            array('id' => '17','customer_group_id' => '1','user_id' => NULL,'name' => 'Customer Nine','company_name' => NULL,'email' => NULL,'phone_number' => '01566448899','tax_no' => NULL,'address' => 'khulshi','city' => 'ctg','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2020-06-22 15:45:35','updated_at' => '2020-06-22 15:45:51'),
            array('id' => '19','customer_group_id' => '1','user_id' => '19','name' => 'Customer Ten','company_name' => 'Digital image','email' => 'shakalaka@gmail.com','phone_number' => '01412336655','tax_no' => '999','address' => 'Andorkillah','city' => 'Chittagong','state' => 'Chittagong','postal_code' => '1234','country' => 'Bangladesh','deposit' => NULL,'expense' => NULL,'is_active' => '1','created_at' => '2020-11-09 06:07:16','updated_at' => '2020-11-09 06:07:16'),
            array('id' => '21','customer_group_id' => '1','user_id' => '21','name' => 'Customer Eleven','company_name' => 'modon company','email' => 'modon@gmail.com','phone_number' => '01422556699','tax_no' => NULL,'address' => 'kuril road','city' => 'Dhaka','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '1','created_at' => '2020-11-13 13:12:11','updated_at' => '2020-11-13 13:12:11'),
            array('id' => '25','customer_group_id' => '1','user_id' => '28','name' => 'Customer Twelve','company_name' => NULL,'email' => 'imran@gmail.com','phone_number' => '01923000001','tax_no' => NULL,'address' => 'kljkj','city' => 'hhjhh','state' => NULL,'postal_code' => NULL,'country' => NULL,'deposit' => NULL,'expense' => NULL,'is_active' => '0','created_at' => '2021-02-04 12:26:47','updated_at' => '2021-02-04 12:26:47')
        ));
    }
}
