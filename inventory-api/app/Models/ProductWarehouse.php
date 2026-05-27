<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductWarehouse extends Model
{
    protected $table = 'product_warehouse';

    protected $fillable = [
        'product_id',
        'variant_id',
        'product_batch_id',
        'warehouse_id',
        'qty',
        'price',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'variant_id' => 'integer',
            'product_batch_id' => 'integer',
            'warehouse_id' => 'integer',
            'qty' => 'float',
            'price' => 'float',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
