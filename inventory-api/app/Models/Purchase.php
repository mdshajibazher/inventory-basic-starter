<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Purchase extends Model
{
    protected $fillable = [
        'reference_no',
        'user_id',
        'warehouse_id',
        'supplier_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_cost',
        'order_tax_rate',
        'order_tax',
        'order_discount',
        'shipping_cost',
        'grand_total',
        'paid_amount',
        'status',
        'payment_status',
        'document',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'warehouse_id' => 'integer',
            'supplier_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_cost' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'order_discount' => 'float',
            'shipping_cost' => 'float',
            'grand_total' => 'float',
            'paid_amount' => 'float',
            'status' => 'integer',
            'payment_status' => 'integer',
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

    public function purchaseStatus(): BelongsTo
    {
        return $this->belongsTo(PurchaseStatus::class, 'status');
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductPurchase::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
