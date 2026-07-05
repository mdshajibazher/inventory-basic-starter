<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Purchase extends Model
{
    use LogsBusinessActivity;

    protected $fillable = [
        'reference_no',
        'purchase_date',
        'user_id',
        'warehouse_id',
        'biller_id',
        'supplier_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_cost',
        'order_tax_rate',
        'order_tax',
        'order_discount',
        'shipping_cost',
        'grand_total',
        'paid_amount',
        'status',
        'payment_status',
        'document',
        'note',
        'approval_status',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'purchase_date' => 'date',
            'warehouse_id' => 'integer',
            'biller_id' => 'integer',
            'supplier_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_cost' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'order_discount' => 'float',
            'shipping_cost' => 'float',
            'grand_total' => 'float',
            'paid_amount' => 'float',
            'status' => 'integer',
            'payment_status' => 'integer',
            'approved_by' => 'integer',
            'approved_at' => 'datetime',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function biller(): BelongsTo
    {
        return $this->belongsTo(Biller::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function purchaseStatus(): BelongsTo
    {
        return $this->belongsTo(PurchaseStatus::class, 'status');
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductPurchase::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
