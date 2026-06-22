<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReturnPurchase extends Model
{
    protected $table = 'return_purchases';

    protected $fillable = [
        'reference_no',
        'supplier_id',
        'warehouse_id',
        'user_id',
        'account_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_cost',
        'order_tax_rate',
        'order_tax',
        'grand_total',
        'document',
        'return_note',
        'staff_note',
    ];

    protected function casts(): array
    {
        return [
            'supplier_id' => 'integer',
            'warehouse_id' => 'integer',
            'user_id' => 'integer',
            'account_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_cost' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'grand_total' => 'float',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(PurchaseProductReturn::class, 'return_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'purchase_return_id');
    }
}
