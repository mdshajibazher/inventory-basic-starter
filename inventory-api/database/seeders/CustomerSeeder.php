<?php

namespace Database\Seeders;

use App\Models\Customer;
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
        $customers = [
            ['customer_group_id' => '1', 'user_id' => '22', 'name' => 'Customer One', 'company_name' => 'lioncoders', 'email' => 'dhiman@gmail.com', 'phone_number' => '01451111101', 'tax_no' => null, 'address' => 'kajir deuri', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'deposit' => '190', 'expense' => '20', 'is_active' => '1', 'created_at' => '2018-05-12 16:00:48', 'updated_at' => '2021-04-12 13:36:17'],
            ['customer_group_id' => '2', 'user_id' => null, 'name' => 'Customer Two', 'company_name' => 'lioncoders', 'email' => null, 'phone_number' => '01200000001', 'tax_no' => null, 'address' => 'jamalkhan', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'deposit' => '100', 'expense' => '20', 'is_active' => '1', 'created_at' => '2018-05-12 16:04:51', 'updated_at' => '2019-02-22 11:38:08'],
            ['customer_group_id' => '2', 'user_id' => null, 'name' => 'Customer Three', 'company_name' => 'big tree', 'email' => null, 'phone_number' => '0165458452', 'tax_no' => null, 'address' => 'khulshi', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'deposit' => null, 'expense' => null, 'is_active' => '1', 'created_at' => '2018-05-12 16:07:52', 'updated_at' => '2019-03-02 11:54:07'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Four', 'company_name' => null, 'email' => null, 'phone_number' => '01444556699', 'tax_no' => null, 'address' => 'frwerw', 'city' => 'qwerwqr', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2018-05-30 07:35:28', 'updated_at' => '2018-05-30 07:37:38'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Five', 'company_name' => 'smart it', 'email' => 'anwar@smartit.com', 'phone_number' => '01766544854', 'tax_no' => null, 'address' => 'nasirabad', 'city' => 'chittagong', 'state' => null, 'postal_code' => null, 'country' => 'bd', 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2018-09-01 09:26:13', 'updated_at' => '2018-09-01 09:29:55'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Six', 'company_name' => null, 'email' => '', 'phone_number' => '01923000001', 'tax_no' => '01655448899', 'address' => 'mohammadpur', 'city' => 'dhaka', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => '0', 'is_active' => '1', 'created_at' => '2018-09-02 07:30:54', 'updated_at' => '2020-07-27 20:28:19'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Seven', 'company_name' => null, 'email' => null, 'phone_number' => '01566669944', 'tax_no' => null, 'address' => 's', 'city' => '3e', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2018-11-05 10:00:39', 'updated_at' => '2018-11-08 09:37:08'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Eight', 'company_name' => null, 'email' => null, 'phone_number' => '01799999944', 'tax_no' => null, 'address' => 'dasd', 'city' => 'asdd', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2018-12-01 06:07:53', 'updated_at' => '2018-12-04 03:55:46'],
            ['customer_group_id' => '1', 'user_id' => null, 'name' => 'Customer Nine', 'company_name' => null, 'email' => null, 'phone_number' => '01566448899', 'tax_no' => null, 'address' => 'khulshi', 'city' => 'ctg', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2020-06-22 15:45:35', 'updated_at' => '2020-06-22 15:45:51'],
            ['customer_group_id' => '1', 'user_id' => '19', 'name' => 'Customer Ten', 'company_name' => 'Digital image', 'email' => 'shakalaka@gmail.com', 'phone_number' => '01412336655', 'tax_no' => '999', 'address' => 'Andorkillah', 'city' => 'Chittagong', 'state' => 'Chittagong', 'postal_code' => '1234', 'country' => 'Bangladesh', 'deposit' => null, 'expense' => null, 'is_active' => '1', 'created_at' => '2020-11-09 06:07:16', 'updated_at' => '2020-11-09 06:07:16'],
            ['customer_group_id' => '1', 'user_id' => '21', 'name' => 'Customer Eleven', 'company_name' => 'modon company', 'email' => 'modon@gmail.com', 'phone_number' => '01422556699', 'tax_no' => null, 'address' => 'kuril road', 'city' => 'Dhaka', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '1', 'created_at' => '2020-11-13 13:12:11', 'updated_at' => '2020-11-13 13:12:11'],
            ['customer_group_id' => '1', 'user_id' => '28', 'name' => 'Customer Twelve', 'company_name' => null, 'email' => 'imran@gmail.com', 'phone_number' => '01923000001', 'tax_no' => null, 'address' => 'kljkj', 'city' => 'hhjhh', 'state' => null, 'postal_code' => null, 'country' => null, 'deposit' => null, 'expense' => null, 'is_active' => '0', 'created_at' => '2021-02-04 12:26:47', 'updated_at' => '2021-02-04 12:26:47'],
        ];

        foreach ($customers as $customer) {
            Customer::query()->updateOrCreate(
                ['name' => $customer['name']],
                $customer
            );
        }
    }
}
