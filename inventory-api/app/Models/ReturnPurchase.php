<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReturnPurchase extends Model
{
    use LogsBusinessActivity;

    protected $table = 'return_purchases';

    protected $fillable = [
        'reference_no',
        'return_date',
        'supplier_id',
        'warehouse_id',
        'biller_id',
        'user_id',
        'account_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_cost',
        'order_tax_rate',
        'order_tax',
        'grand_total',
        'document',
        'return_note',
        'staff_note',
        'approval_status',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'return_date' => 'date',
            'supplier_id' => 'integer',
            'warehouse_id' => 'integer',
            'biller_id' => 'integer',
            'user_id' => 'integer',
            'account_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_cost' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'grand_total' => 'float',
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

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(PurchaseProductReturn::class, 'return_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'purchase_return_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
