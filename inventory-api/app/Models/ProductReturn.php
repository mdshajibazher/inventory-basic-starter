<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductReturn extends Model
{
    protected $table = 'product_returns';

    protected $fillable = [
        'return_id',
        'date',
        'product_id',
        'variant_id',
        'product_batch_id',
        'qty',
        'sale_unit_id',
        'net_unit_price',
        'discount',
        'tax_rate',
        'tax_method',
        'tax',
        'total',
        'unit_cost',
        'total_cost',
    ];

    protected function casts(): array
    {
        return [
            'return_id' => 'integer',
            'date' => 'date',
            'product_id' => 'integer',
            'variant_id' => 'integer',
            'product_batch_id' => 'integer',
            'qty' => 'float',
            'sale_unit_id' => 'integer',
            'net_unit_price' => 'float',
            'discount' => 'float',
            'tax_rate' => 'float',
            'tax_method' => 'integer',
            'tax' => 'float',
            'total' => 'float',
            'unit_cost' => 'float',
            'total_cost' => 'float',
        ];
    }

    public function returnInvoice(): BelongsTo
    {
        return $this->belongsTo(ReturnInvoice::class, 'return_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductBatch::class, 'product_batch_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'sale_unit_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
