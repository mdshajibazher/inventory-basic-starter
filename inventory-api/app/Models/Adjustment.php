<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Adjustment extends Model
{
    protected $fillable = [
        'reference_no',
        'warehouse_id',
        'document',
        'total_qty',
        'item',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'warehouse_id' => 'integer',
            'total_qty' => 'float',
            'item' => 'integer',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductAdjustment::class);
    }
}
