<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseProductReturn extends Model
{
    protected $table = 'purchase_product_return';

    protected $fillable = [
        'return_id',
        'product_id',
        'qty',
        'purchase_unit_id',
        'net_unit_cost',
        'discount',
        'tax_rate',
        'tax',
        'total',
    ];

    protected function casts(): array
    {
        return [
            'return_id' => 'integer',
            'product_id' => 'integer',
            'qty' => 'float',
            'purchase_unit_id' => 'integer',
            'net_unit_cost' => 'float',
            'discount' => 'float',
            'tax_rate' => 'float',
            'tax' => 'float',
            'total' => 'float',
        ];
    }

    public function returnPurchase(): BelongsTo
    {
        return $this->belongsTo(ReturnPurchase::class, 'return_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'purchase_unit_id');
    }
}
