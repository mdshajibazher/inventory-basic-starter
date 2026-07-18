<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\CustomerGroup;
use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $inventoryPermissions = [
            'products-index',
            'products-add',
            'products-edit',
            'products-delete',
            'brands-index',
            'brands-add',
            'brands-edit',
            'brands-delete',
            'branches-index',
            'branches-add',
            'branches-edit',
            'branches-delete',
            'categories-index',
            'categories-add',
            'categories-edit',
            'categories-delete',
            'units-index',
            'units-add',
            'units-edit',
            'units-delete',
            'taxes-index',
            'taxes-add',
            'taxes-edit',
            'taxes-delete',
            'currencies-index',
            'currencies-add',
            'currencies-edit',
            'currencies-delete',
            'warehouses-index',
            'warehouses-add',
            'warehouses-edit',
            'warehouses-delete',
            'accounts-index',
            'accounts-add',
            'accounts-edit',
            'accounts-delete',
            'expenses-index',
            'expenses-add',
            'expenses-edit',
            'expenses-delete',
            'general-settings-index',
            'general-settings-add',
            'general-settings-edit',
            'general-settings-delete',
            'customers-index',
            'customers-add',
            'customers-edit',
            'customers-delete',
            'suppliers-index',
            'suppliers-add',
            'suppliers-edit',
            'suppliers-delete',
            'sales-index',
            'sales-add',
            'sales-show',
            'sales-edit',
            'sales-delete',
            'returns-index',
            'returns-add',
            'returns-show',
            'returns-edit',
            'returns-delete',
            'purchases-index',
            'purchases-add',
            'purchases-show',
            'purchases-edit',
            'purchases-delete',
            'product-stocks-index',
            'product-stocks-adjust',
            'transfers-index',
            'transfers-add',
            'transfers-show',
            'transfers-edit',
            'transfers-delete',
            'reports-profit',
        ];

        $userPermissions = [
            'users-index',
            'users-add',
            'users-edit',
            'users-delete',
        ];

        Permission::query()
            ->whereIn('name', ['brand', 'category', 'currency', 'tax', 'unit'])
            ->delete();

        $permissions = collect([
            ...$inventoryPermissions,
            ...$userPermissions,
        ])->mapWithKeys(function ($name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name]);
            $permission->forceFill(['guard_name' => 'web'])->save();

            return [$name => $permission];
        });

        $adminRole = Role::query()->firstOrCreate(
            ['name' => 'Admin'],
            [
                'description' => 'admin can access all data...',
                'guard_name' => 'web',
                'is_active' => true,
            ]
        );
        $adminRole->forceFill(['guard_name' => 'web', 'is_active' => true])->save();
        $adminRole->permissions()->sync($permissions->pluck('id')->all());

        $dummyRole = Role::query()->firstOrCreate(
            ['name' => 'Dummy'],
            [
                'description' => 'Dummy inventory role for product, brand, category, and unit access.',
                'guard_name' => 'web',
                'is_active' => true,
            ]
        );
        $dummyRole->forceFill(['guard_name' => 'web', 'is_active' => true])->save();
        $dummyRole->syncPermissions([
            ...$inventoryPermissions,
        ]);

        Role::query()->firstOrCreate(
            ['name' => 'Customer'],
            [
                'description' => 'Customer portal user.',
                'guard_name' => 'web',
                'is_active' => true,
            ]
        );

        $user = User::query()->firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Inventory Admin',
                'password' => 'password',
                'phone' => '01700817934',
                'role_id' => $adminRole->id,
            ]
        );
        $user->forceFill(['role_id' => $adminRole->id])->save();
        $user->assignRole($adminRole);
        // $user->syncPermissions($permissions->keys()->all());

        $drinks = Category::query()->firstOrCreate(
            ['name' => 'Test'],
            ['is_active' => true]
        );

        $office = Category::query()->firstOrCreate(
            ['name' => 'Office Supplies'],
            ['is_active' => true]
        );

        CustomerGroup::query()->firstOrCreate(
            ['name' => 'General'],
            ['percentage' => '0', 'is_active' => true]
        );

        $this->call(WarehouseSeeder::class);
        $this->call(GeneralSettingsSeeder::class);
        $this->call(UnitGroupSeeder::class);
        $this->call(UnitSeeder::class);
        $this->call(TaxSeeder::class);
        $this->call(PurchaseStatusSeeder::class);
        $this->call(BillerSeeder::class);
        $this->call(SupplierSeeder::class);
        $this->call(BrandSeeder::class);
        $this->call(AccountSeeder::class);
        $this->call(ExpenseCategorySeeder::class);
        $this->call(CustomerSeeder::class);
        // $this->call(StandardProductDemoSeeder::class);
        // $this->call(ProductSeeder::class);

        // Product::query()->firstOrCreate(
        //     ['sku' => 'COKE-500'],
        //     [
        //         'category_id' => $drinks->id,
        //         'name' => 'Coca-Cola 500ml',
        //         'barcode' => '100000000001',
        //         'purchase_price' => 35,
        //         'selling_price' => 45,
        //         'quantity' => 20,
        //         'low_stock_limit' => 5,
        //         'description' => 'Demo product',
        //     ]
        // );

        // Product::query()->firstOrCreate(
        //     ['sku' => 'PAPER-A4'],
        //     [
        //         'category_id' => $office->id,
        //         'name' => 'A4 Paper Ream',
        //         'barcode' => '100000000002',
        //         'purchase_price' => 420,
        //         'selling_price' => 500,
        //         'quantity' => 4,
        //         'low_stock_limit' => 5,
        //         'description' => 'Low-stock demo product',
        //     ]
        // );
    }
}
