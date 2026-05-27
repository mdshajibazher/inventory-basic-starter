<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Coupon extends Model
{
    protected $fillable = [
        'code',
        'type',
        'amount',
        'minimum_amount',
        'quantity',
        'used',
        'expired_date',
        'user_id',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'minimum_amount' => 'float',
            'quantity' => 'integer',
            'used' => 'integer',
            'expired_date' => 'date',
            'user_id' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
