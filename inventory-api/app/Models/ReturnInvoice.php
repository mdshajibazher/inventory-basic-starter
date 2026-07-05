<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReturnInvoice extends Model
{
    use LogsBusinessActivity;

    protected $table = 'returns';

    protected $fillable = [
        'reference_no',
        'return_date',
        'user_id',
        'cash_register_id',
        'customer_id',
        'warehouse_id',
        'biller_id',
        'account_id',
        'item',
        'total_qty',
        'total_discount',
        'total_tax',
        'total_price',
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
            'user_id' => 'integer',
            'return_date' => 'date',
            'cash_register_id' => 'integer',
            'customer_id' => 'integer',
            'warehouse_id' => 'integer',
            'biller_id' => 'integer',
            'account_id' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_discount' => 'float',
            'total_tax' => 'float',
            'total_price' => 'float',
            'order_tax_rate' => 'float',
            'order_tax' => 'float',
            'grand_total' => 'float',
            'approved_by' => 'integer',
            'approved_at' => 'datetime',
        ];
    }

    public function biller(): BelongsTo
    {
        return $this->belongsTo(Biller::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductReturn::class, 'return_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'sale_return_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
