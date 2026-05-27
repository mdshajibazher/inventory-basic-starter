<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GiftCard extends Model
{
    protected $fillable = [
        'card_no',
        'amount',
        'expense',
        'customer_id',
        'user_id',
        'expired_date',
        'created_by',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'expense' => 'float',
            'customer_id' => 'integer',
            'user_id' => 'integer',
            'expired_date' => 'date',
            'created_by' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
