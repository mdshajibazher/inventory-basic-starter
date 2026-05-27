<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'purchase_id',
        'user_id',
        'sale_id',
        'cash_register_id',
        'account_id',
        'payment_reference',
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
            'cash_register_id' => 'integer',
            'account_id' => 'integer',
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
}
