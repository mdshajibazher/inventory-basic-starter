<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductTransfer extends Model
{
    protected $table = 'product_transfer';

    protected $fillable = [
        'transfer_id',
        'product_id',
        'product_batch_id',
        'variant_id',
        'qty',
        'purchase_unit_id',
        'net_unit_cost',
        'tax_rate',
        'tax',
        'total',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'transfer_id' => 'integer',
            'product_id' => 'integer',
            'product_batch_id' => 'integer',
            'variant_id' => 'integer',
            'qty' => 'float',
            'purchase_unit_id' => 'integer',
            'net_unit_cost' => 'float',
            'tax_rate' => 'float',
            'tax' => 'float',
            'total' => 'float',
        ];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(Transfer::class);
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
