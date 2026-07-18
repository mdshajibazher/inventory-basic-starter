<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Transfer extends Model
{
    use LogsBusinessActivity;

    public const STATUS_PENDING = 1;
    public const STATUS_COMPLETED = 2;

    protected $fillable = [
        'reference_no',
        'transfer_date',
        'user_id',
        'status',
        'from_warehouse_id',
        'to_warehouse_id',
        'expected_delivery_date',
        'requested_by',
        'item',
        'total_qty',
        'total_tax',
        'total_cost',
        'shipping_cost',
        'grand_total',
        'document',
        'vehicle_courier',
        'driver_contact',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'transfer_date' => 'date',
            'user_id' => 'integer',
            'status' => 'integer',
            'from_warehouse_id' => 'integer',
            'to_warehouse_id' => 'integer',
            'expected_delivery_date' => 'date',
            'requested_by' => 'integer',
            'item' => 'integer',
            'total_qty' => 'float',
            'total_tax' => 'float',
            'total_cost' => 'float',
            'shipping_cost' => 'float',
            'grand_total' => 'float',
        ];
    }

    public function fromWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'from_warehouse_id');
    }

    public function toWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'to_warehouse_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function products(): HasMany
    {
        return $this->hasMany(ProductTransfer::class);
    }
}
