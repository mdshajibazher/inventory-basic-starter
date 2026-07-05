<?php

namespace App\Models\Concerns;

use App\Models\Account;
use App\Models\Biller;
use App\Models\Category;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\ReturnInvoice;
use App\Models\ReturnPurchase;
use App\Models\Role;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

trait LogsBusinessActivity
{
    use LogsActivity;

    protected static $recordEvents = ['created', 'updated', 'deleted'];

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->useLogName($this->activityLogName())
            ->logFillable()
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['updated_at'])
            ->dontSubmitEmptyLogs()
            ->setDescriptionForEvent(
                fn (string $eventName): string => $this->activityLogDescription($eventName)
            );
    }

    protected function activityLogName(): string
    {
        return match (static::class) {
            Sale::class => 'sales_invoice',
            Purchase::class => 'purchase_invoice',
            ReturnInvoice::class => 'sales_return',
            ReturnPurchase::class => 'purchase_return',
            Payment::class => 'payment',
            Expense::class => 'expense',
            Product::class => 'product',
            Customer::class => 'customer',
            User::class => 'user',
            Biller::class => 'branch',
            Category::class => 'category',
            Warehouse::class => 'warehouse',
            Unit::class => 'unit',
            Currency::class => 'currency',
            Account::class => 'account',
            Role::class => 'role',
            Permission::class => 'permission',
            Supplier::class => 'supplier',
            StockMovement::class => 'product_stock_movement',
            default => class_basename($this),
        };
    }

    protected function activityLogDescription(string $eventName): string
    {
        $label = match (static::class) {
            Sale::class => 'Sales invoice',
            Purchase::class => 'Purchase invoice',
            ReturnInvoice::class => 'Sales return',
            ReturnPurchase::class => 'Purchase return',
            Payment::class => 'Payment',
            Expense::class => 'Expense',
            Product::class => 'Product',
            Customer::class => 'Customer',
            User::class => 'User',
            Biller::class => 'Branch',
            Category::class => 'Category',
            Warehouse::class => 'Warehouse',
            Unit::class => 'Unit',
            Currency::class => 'Currency',
            Account::class => 'Account',
            Role::class => 'Role',
            Permission::class => 'Permission',
            Supplier::class => 'Supplier',
            StockMovement::class => 'Product stock movement',
            default => class_basename($this),
        };

        return "{$label} {$eventName}";
    }
}
