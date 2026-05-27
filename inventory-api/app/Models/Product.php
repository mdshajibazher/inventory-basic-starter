<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'name',
        'code',
        'type',
        'barcode_symbology',
        'brand_id',
        'category_id',
        'unit_id',
        'purchase_unit_id',
        'sale_unit_id',
        'cost',
        'price',
        'qty',
        'alert_quantity',
        'promotion',
        'promotion_price',
        'starting_date',
        'last_date',
        'tax_id',
        'tax_method',
        'image',
        'file',
        'featured',
        'product_details',
        'product_list',
        'qty_list',
        'price_list',
        'is_variant',
        'is_batch',
        'is_diffPrice',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'brand_id' => 'integer',
            'category_id' => 'integer',
            'unit_id' => 'integer',
            'purchase_unit_id' => 'integer',
            'sale_unit_id' => 'integer',
            'cost' => 'decimal:2',
            'price' => 'decimal:2',
            'qty' => 'float',
            'alert_quantity' => 'float',
            'promotion' => 'boolean',
            'promotion_price' => 'decimal:2',
            'starting_date' => 'date',
            'last_date' => 'date',
            'tax_id' => 'integer',
            'tax_method' => 'integer',
            'featured' => 'boolean',
            'is_variant' => 'boolean',
            'is_batch' => 'boolean',
            'is_diffPrice' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function purchaseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'purchase_unit_id');
    }

    public function saleUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'sale_unit_id');
    }

    public function tax(): BelongsTo
    {
        return $this->belongsTo(Tax::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('position');
    }

    public function warehousePrices(): HasMany
    {
        return $this->hasMany(ProductWarehouse::class)->whereNull('variant_id')->whereNull('product_batch_id')->orderBy('warehouse_id');
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }
}
