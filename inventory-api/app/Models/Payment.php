<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    public const TYPE_SALE_PAYMENT = 'sale_payment';

    public const TYPE_CUSTOMER_ADVANCE = 'customer_advance';

    public const TYPE_PURCHASE_PAYMENT = 'purchase_payment';

    public const TYPE_SUPPLIER_ADVANCE = 'supplier_advance';

    public const TYPE_SALE_RETURN_REFUND = 'sale_return_refund';

    public const TYPE_PURCHASE_RETURN_REFUND = 'purchase_return_refund';

    public const DIRECTION_IN = 'in';

    public const DIRECTION_OUT = 'out';

    protected $fillable = [
        'purchase_id',
        'user_id',
        'sale_id',
        'sale_return_id',
        'purchase_return_id',
        'cash_register_id',
        'account_id',
        'customer_id',
        'supplier_id',
        'payment_reference',
        'payment_type',
        'direction',
        'amount',
        'change',
        'paying_method',
        'payment_note',
    ];

    protected function casts(): array
    {
        return [
            'purchase_id' => 'integer',
            'user_id' => 'integer',
            'sale_id' => 'integer',
            'sale_return_id' => 'integer',
            'purchase_return_id' => 'integer',
            'cash_register_id' => 'integer',
            'account_id' => 'integer',
            'customer_id' => 'integer',
            'supplier_id' => 'integer',
            'amount' => 'float',
            'change' => 'float',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(ReturnInvoice::class, 'sale_return_id');
    }

    public function purchaseReturn(): BelongsTo
    {
        return $this->belongsTo(ReturnPurchase::class, 'purchase_return_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
