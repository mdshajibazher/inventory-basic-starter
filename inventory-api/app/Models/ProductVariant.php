<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariant extends Model
{
    protected $fillable = [
        'product_id',
        'variant_id',
        'position',
        'item_code',
        'additional_price',
        'qty',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'variant_id' => 'integer',
            'position' => 'integer',
            'additional_price' => 'float',
            'qty' => 'float',
        ];
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
