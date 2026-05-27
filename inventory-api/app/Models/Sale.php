<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = [
        'reference_no',
        'user_id',
        'cash_register_id',
        'customer_id',
        'warehouse_id',
        'biller_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_price',
        'order_tax_rate',
        'order_tax',
        'order_discount',
        'coupon_id',
        'coupon_discount',
        'shipping_cost',
        'grand_total',
        'sale_status',
        'payment_status',
        'paid_amount',
        'document',
        'sale_note',
        'staff_note',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'cash_register_id' => 'integer',
            'customer_id' => 'integer',
            'warehouse_id' => 'integer',
            'biller_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_price' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'order_discount' => 'float',
            'coupon_id' => 'integer',
            'coupon_discount' => 'float',
            'shipping_cost' => 'float',
            'grand_total' => 'float',
            'sale_status' => 'integer',
            'payment_status' => 'integer',
            'paid_amount' => 'float',
        ];
    }

    public function biller(): BelongsTo
    {
        return $this->belongsTo(Biller::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductSale::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
