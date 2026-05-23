<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Models\Category::insert(array(
            array('id' => '1','name' => 'Fruits','image' => NULL,'parent_id' => '9','is_active' => '1','created_at' => '2018-05-12 09:27:25','updated_at' => '2019-03-01 21:07:21'),
            array('id' => '2','name' => 'Electronics','image' => NULL,'parent_id' => NULL,'is_active' => '1','created_at' => '2018-05-12 09:35:57','updated_at' => '2019-03-01 21:07:21'),
            array('id' => '3','name' => 'Computer','image' => '20200701093146.jpg','parent_id' => '2','is_active' => '1','created_at' => '2018-05-12 09:36:08','updated_at' => '2020-07-01 21:31:46'),
            array('id' => '4','name' => 'Toy','image' => NULL,'parent_id' => NULL,'is_active' => '1','created_at' => '2018-05-24 04:57:48','updated_at' => '2019-03-01 21:09:27'),
            array('id' => '7','name' => 'Jacket','image' => NULL,'parent_id' => NULL,'is_active' => '0','created_at' => '2018-05-28 04:39:51','updated_at' => '2018-05-28 04:40:48'),
            array('id' => '9','name' => 'Food','image' => NULL,'parent_id' => NULL,'is_active' => '1','created_at' => '2018-06-25 07:21:40','updated_at' => '2018-09-03 09:41:28'),
            array('id' => '10','name' => 'Egg','image' => NULL,'parent_id' => NULL,'is_active' => '0','created_at' => '2018-08-29 05:36:31','updated_at' => '2018-08-29 05:37:34'),
            array('id' => '11','name' => 'Quality Egg','image' => NULL,'parent_id' => NULL,'is_active' => '0','created_at' => '2018-08-29 05:48:06','updated_at' => '2018-08-29 05:53:22'),
            array('id' => '12','name' => 'Accessories','image' => NULL,'parent_id' => NULL,'is_active' => '1','created_at' => '2018-12-05 05:28:53','updated_at' => '2019-04-10 10:17:03'),
            array('id' => '14','name' => 'Lorem','image' => NULL,'parent_id' => NULL,'is_active' => '0','created_at' => '2019-04-10 10:22:30','updated_at' => '2019-04-10 11:38:47'),
            array('id' => '15','name' => 'Ipsum','image' => NULL,'parent_id' => NULL,'is_active' => '0','created_at' => '2019-04-10 10:22:36','updated_at' => '2019-04-10 11:41:43'),
            array('id' => '16','name' => 'Desktop','image' => NULL,'parent_id' => '3','is_active' => '1','created_at' => '2020-03-11 16:42:33','updated_at' => '2020-03-11 16:42:33'),
            array('id' => '17','name' => 'Delicious','image' => '20200701080042.png','parent_id' => NULL,'is_active' => '0','created_at' => '2020-07-01 20:00:42','updated_at' => '2020-07-01 21:35:34'),
            array('id' => '19','name' => 'Paracetamol','image' => NULL,'parent_id' => NULL,'is_active' => '1','created_at' => '2021-03-07 13:16:01','updated_at' => '2021-03-07 13:16:01')
        ));
    }
}
