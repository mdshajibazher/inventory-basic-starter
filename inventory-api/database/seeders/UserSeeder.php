<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        \App\User::insert(array(
            array('id' => '1','name' => 'admin','email' => 'admin@gmail.com','password' => '$2y$10$DWAHTfjcvwCpOCXaJg11MOhsqns03uvlwiSUOQwkHL2YYrtrXPcL6','remember_token' => 'k6eDmUm2DRRZXXoEADexL5HZYNG3uzbdIcfyoD2ph8CMMOZcoNi0vHwwliRK','phone' => '01711111111','company_name' => 'lioncoders','role_id' => '1','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '1','is_deleted' => '0','created_at' => '2018-06-02 09:24:15','updated_at' => '2018-09-05 06:14:15'),
            array('id' => '3','name' => 'dhiman da','email' => 'dhiman@gmail.com','password' => '$2y$10$Fef6vu5E67nm11hX7V5a2u1ThNCQ6n9DRCvRF9TD7stk.Pmt2R6O.','remember_token' => '5ehQM6JIfiQfROgTbB5let0Z93vjLHS7rd9QD5RPNgOxli3xdo7fykU7vtTt','phone' => '01700000000','company_name' => 'lioncoders','role_id' => '1','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '0','is_deleted' => '1','created_at' => '2018-06-14 04:00:31','updated_at' => '2020-11-05 13:06:51'),
            array('id' => '6','name' => 'Test One','email' => 'test@gmail.com','password' => '$2y$10$TDAeHcVqHyCmurki0wjLZeIl1SngKX3WLOhyTiCoZG3souQfqv.LS','remember_token' => 'KpW1gYYlOFacumklO2IcRfSsbC3KcWUZzOI37gqoqM388Xie6KdhaOHIFEYm','phone' => '01733333333','company_name' => '212312','role_id' => '4','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '0','is_deleted' => '1','created_at' => '2018-06-23 09:05:33','updated_at' => '2018-06-23 09:13:45'),
            array('id' => '8','name' => 'Test Two','email' => 'test@yahoo.com','password' => '$2y$10$hlMigidZV0j2/IPkgE/xsOSb8WM2IRlsMv.1hg1NM7kfyd6bGX3hC','remember_token' => NULL,'phone' => '31231','company_name' => NULL,'role_id' => '4','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '0','is_deleted' => '1','created_at' => '2018-06-25 04:35:49','updated_at' => '2018-07-02 07:07:39'),
            array('id' => '9','name' => 'Staff','email' => 'anda@gmail.com','password' => '$2y$10$kxDbnynB6mB1e1w3pmtbSOlSxy/WwbLPY5TJpMi0Opao5ezfuQjQm','remember_token' => '4mpeALkXgGbBYEZuCTT6zaAlKvTYqyHMMKgrDXMA0nzSh7UnzUNpi1KgOEbg','phone' => '01944444444','company_name' => NULL,'role_id' => '4','biller_id' => '5','warehouse_id' => '1','is_active' => '1','is_deleted' => '0','created_at' => '2018-07-02 07:08:08','updated_at' => '2018-10-24 03:41:13'),
            array('id' => '10','name' => 'Abul','email' => 'abul@alpha.com','password' => '$2y$10$5zgB2OOMyNBNVAd.QOQIju5a9fhNnTqPx5H6s4oFlXhNiF6kXEsPq','remember_token' => 'x7HlttI5bM0vSKViqATaowHFJkLS3PHwfvl7iJdFl5Z1SsyUgWCVbLSgAoi0','phone' => '01855555555','company_name' => 'anda','role_id' => '1','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '0','is_deleted' => '0','created_at' => '2018-09-08 05:44:48','updated_at' => '2018-09-08 05:44:48'),
            array('id' => '11','name' => 'John Doe','email' => 'a@a.com','password' => '$2y$10$5KNBIIhZzvvZEQEhkHaZGu.Q8bbQNfqYvYgL5N55B8Pb4P5P/b/Li','remember_token' => 'DkHDEcCA0QLfsKPkUK0ckL0CPM6dPiJytNa0k952gyTbeAyMthW3vi7IRitp','phone' => '01766666666','company_name' => 'aa','role_id' => '4','biller_id' => '5','warehouse_id' => '1','is_active' => '0','is_deleted' => '1','created_at' => '2018-10-22 08:47:56','updated_at' => '2018-10-23 08:10:56'),
            array('id' => '12','name' => 'John Sina','email' => 'john@gmail.com','password' => '$2y$10$P/pN2J/uyTYNzQy2kRqWwuSv7P2f6GE/ykBwtHdda7yci3XsfOKWe','remember_token' => 'O0f1WJBVjT5eKYl3Js5l1ixMMtoU6kqrH7hbHDx9I1UCcD9CmiSmCBzHbQZg','phone' => '01777777777','company_name' => NULL,'role_id' => '4','biller_id' => '2','warehouse_id' => '2','is_active' => '0','is_deleted' => '1','created_at' => '2018-12-30 06:48:37','updated_at' => '2019-03-06 10:59:49'),
            array('id' => '13','name' => 'Jeffry Way','email' => 'test@test.com','password' => '$2y$10$/Qx3gHWYWUhlF1aPfzXaCeZA7fRzfSEyCIOnk/dcC4ejO8PsoaalG','remember_token' => NULL,'phone' => '1213','company_name' => NULL,'role_id' => '1','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '0','is_deleted' => '1','created_at' => '2019-01-03 06:08:31','updated_at' => '2019-03-03 10:02:29'),
            array('id' => '19','name' => 'Lorem Ipsum','email' => 'shakalaka@gmail.com','password' => '$2y$10$ketLWT0Ib/JXpo00eJlxoeSw.7leS8V1CUGInfbyOWT4F5.Xuo7S2','remember_token' => NULL,'phone' => '01788888888','company_name' => 'Digital image','role_id' => '5','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '1','is_deleted' => '0','created_at' => '2020-11-09 06:07:16','updated_at' => '2020-11-09 06:07:16'),
            array('id' => '21','name' => 'Dolor Sit','email' => 'modon@gmail.com','password' => '$2y$10$7VpoeGMkP8QCvL5zLwFW..6MYJ5MRumDLDoX.TTQtClS561rpFHY.','remember_token' => NULL,'phone' => '01799999999','company_name' => 'modon company','role_id' => '5','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '1','is_deleted' => '0','created_at' => '2020-11-13 13:12:08','updated_at' => '2020-11-13 13:12:08'),
            array('id' => '22','name' => 'Dhiman','email' => 'dhiman@gmail.com','password' => '$2y$10$3mPygsC6wwnDtw/Sg85IpuExtUhgaHx52Lwp7Rz0.FNfuFdfKVpRq','remember_token' => NULL,'phone' => '01111111101','company_name' => 'lioncoders','role_id' => '5','biller_id' => NULL,'warehouse_id' => NULL,'is_active' => '1','is_deleted' => '0','created_at' => '2020-11-15 12:14:58','updated_at' => '2020-11-15 12:14:58')
        ));
    }
}
