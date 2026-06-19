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
        'unit_group_id',
        'base_unit',
        'operator',
        'operation_value',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'unit_group_id' => 'integer',
            'base_unit' => 'integer',
            'operation_value' => 'float',
            'is_active' => 'boolean',
        ];
    }

    public function unitGroup(): BelongsTo
    {
        return $this->belongsTo(UnitGroup::class);
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

    public function productPurchases(): HasMany
    {
        return $this->hasMany(ProductPurchase::class, 'purchase_unit_id');
    }

    public function productSales(): HasMany
    {
        return $this->hasMany(ProductSale::class, 'sale_unit_id');
    }

    public function productReturns(): HasMany
    {
        return $this->hasMany(ProductReturn::class, 'sale_unit_id');
    }

    public function isUsedInInvoices(): bool
    {
        return $this->productPurchases()->exists()
            || $this->productSales()->exists()
            || $this->productReturns()->exists();
    }
}
