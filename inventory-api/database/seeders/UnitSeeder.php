<?php

namespace Database\Seeders;

use App\Models\Unit;
use App\Models\UnitGroup;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $groups = UnitGroup::query()->pluck('id', 'title');

        $units = [
            ['id' => 1, 'unit_code' => 'pc', 'unit_name' => 'Piece', 'unit_group_id' => $groups['count'] ?? null, 'base_unit' => null, 'operator' => '*', 'operation_value' => '1', 'is_active' => '1', 'created_at' => '2018-05-12 08:27:46', 'updated_at' => '2018-08-18 03:41:53'],
            ['id' => 2, 'unit_code' => 'dozen', 'unit_name' => 'dozen box', 'unit_group_id' => $groups['count'] ?? null, 'base_unit' => '1', 'operator' => '*', 'operation_value' => '12', 'is_active' => '1', 'created_at' => '2018-05-12 15:57:05', 'updated_at' => '2018-05-12 15:57:05'],
            ['id' => 3, 'unit_code' => 'cartoon', 'unit_name' => 'cartoon box', 'unit_group_id' => $groups['count'] ?? null, 'base_unit' => '1', 'operator' => '*', 'operation_value' => '24', 'is_active' => '1', 'created_at' => '2018-05-12 15:57:45', 'updated_at' => '2020-03-11 16:36:59'],
            ['id' => 4, 'unit_code' => 'ml', 'unit_name' => 'Mililiter', 'unit_group_id' => $groups['volume'] ?? null, 'base_unit' => null, 'operator' => '*', 'operation_value' => '1', 'is_active' => '1', 'created_at' => '2018-05-12 15:58:07', 'updated_at' => '2018-05-28 05:20:57'],
            ['id' => 5, 'unit_code' => 'kg', 'unit_name' => 'kilogram', 'unit_group_id' => $groups['weight'] ?? null, 'base_unit' => null, 'operator' => '*', 'operation_value' => '1', 'is_active' => '1', 'created_at' => '2018-06-25 06:49:26', 'updated_at' => '2018-06-25 06:49:26'],
            ['id' => 6, 'unit_code' => 'sack (40kg)', 'unit_name' => 'sack 40 kg', 'unit_group_id' => $groups['weight'] ?? null, 'base_unit' => '5', 'operator' => '*', 'operation_value' => '40', 'is_active' => '1', 'created_at' => '2018-06-25 06:49:26', 'updated_at' => '2018-06-25 06:49:26'],
            ['id' => 7, 'unit_code' => 'sack (25kg)', 'unit_name' => 'sack 25 kg', 'unit_group_id' => $groups['weight'] ?? null, 'base_unit' => '5', 'operator' => '*', 'operation_value' => '25', 'is_active' => '1', 'created_at' => '2018-06-25 06:49:26', 'updated_at' => '2018-06-25 06:49:26'],
            ['id' => 8, 'unit_code' => 'ounce', 'unit_name' => 'Ounce', 'unit_group_id' => $groups['weight'] ?? null, 'base_unit' => '8', 'operator' => '*', 'operation_value' => '1', 'is_active' => '0', 'created_at' => '2018-08-01 04:35:51', 'updated_at' => '2018-08-01 04:40:54'],
            ['id' => 9, 'unit_code' => 'gm', 'unit_name' => 'gram', 'unit_group_id' => $groups['weight'] ?? null, 'base_unit' => '5', 'operator' => '/', 'operation_value' => '1000', 'is_active' => '1', 'created_at' => '2018-09-01 06:06:28', 'updated_at' => '2018-09-01 06:06:28'],
            ['id' => 10, 'unit_code' => 'gz', 'unit_name' => 'goz', 'unit_group_id' => $groups['length'] ?? null, 'base_unit' => null, 'operator' => '*', 'operation_value' => '1', 'is_active' => '0', 'created_at' => '2018-11-29 09:40:29', 'updated_at' => '2019-03-02 17:53:29'],
        ];

        Unit::unguarded(function () use ($units) {
            foreach ($units as $unit) {
                Unit::query()->updateOrCreate(
                    ['id' => $unit['id']],
                    $unit
                );
            }
        });
    }
}
