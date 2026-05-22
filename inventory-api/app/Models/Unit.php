<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Unit extends Model
{
    protected $fillable = [
        'unit_code',
        'unit_name',
        'base_unit',
        'operator',
        'operation_value',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'base_unit' => 'integer',
            'operation_value' => 'float',
            'is_active' => 'boolean',
        ];
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'base_unit');
    }

    public function relatedUnits(): HasMany
    {
        return $this->hasMany(Unit::class, 'base_unit');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
