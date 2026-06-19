<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $table = 'product_stock_movements';

    protected $fillable = [
        'product_id',
        'warehouse_id',
        'product_batch_id',
        'variant_id',
        'unit_id',
        'user_id',
        'source_type',
        'source_id',
        'type',
        'quantity',
        'quantity_base',
        'before_quantity',
        'after_quantity',
        'reference_no',
        'note',
        'movement_date',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'warehouse_id' => 'integer',
            'product_batch_id' => 'integer',
            'variant_id' => 'integer',
            'unit_id' => 'integer',
            'user_id' => 'integer',
            'source_id' => 'integer',
            'quantity' => 'float',
            'quantity_base' => 'float',
            'before_quantity' => 'float',
            'after_quantity' => 'float',
            'movement_date' => 'date',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductBatch::class, 'product_batch_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
