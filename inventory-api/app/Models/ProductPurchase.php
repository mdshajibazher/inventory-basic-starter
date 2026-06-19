<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPurchase extends Model
{
    protected $fillable = [
        'purchase_id',
        'date',
        'product_id',
        'product_batch_id',
        'variant_id',
        'qty',
        'recieved',
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
            'purchase_id' => 'integer',
            'date' => 'date',
            'product_id' => 'integer',
            'product_batch_id' => 'integer',
            'variant_id' => 'integer',
            'qty' => 'float',
            'recieved' => 'float',
            'purchase_unit_id' => 'integer',
            'net_unit_cost' => 'float',
            'discount' => 'float',
            'tax_rate' => 'float',
            'tax' => 'float',
            'total' => 'float',
        ];
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'purchase_unit_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductBatch::class, 'product_batch_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
