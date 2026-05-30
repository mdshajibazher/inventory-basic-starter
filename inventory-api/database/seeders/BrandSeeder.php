<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class BrandSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\Models\Brand::upsert(array(
            array('title' => 'HP','image' => 'HP.jpg','is_active' => '1','created_at' => '2018-05-12 15:06:14','updated_at' => '2019-03-02 11:32:21'),
            array('title' => 'Samsung','image' => 'samsung.jpg','is_active' => '1','created_at' => '2018-05-12 15:08:41','updated_at' => '2018-07-04 09:38:37'),
            array('title' => 'Apple','image' => 'Apple.jpg','is_active' => '1','created_at' => '2018-09-01 05:34:49','updated_at' => '2018-12-06 09:05:38'),
            array('title' => 'Others','image' => '20201019093419.jpg','is_active' => '0','created_at' => '2020-10-19 21:33:52','updated_at' => '2020-10-19 21:35:58'),
            array('title' => 'Lotto','image' => NULL,'is_active' => '1','created_at' => '2020-11-16 10:13:41','updated_at' => '2020-11-16 10:13:41')
        ),['title']);
    }
}
