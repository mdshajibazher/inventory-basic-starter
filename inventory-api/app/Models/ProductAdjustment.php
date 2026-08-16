<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ProductAdjustment extends Model
{
    protected $fillable = [
        'adjustment_id',
        'product_id',
        'variant_id',
        'qty',
        'action',
    ];

    protected function casts(): array
    {
        return [
            'adjustment_id' => 'integer',
            'product_id' => 'integer',
            'variant_id' => 'integer',
            'qty' => 'float',
        ];
    }

    public function adjustment(): BelongsTo
    {
        return $this->belongsTo(Adjustment::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    public function movement(): HasOne
    {
        return $this->hasOne(StockMovement::class, 'source_id')
            ->where('source_type', 'product_adjustment');
    }
}
