<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CashRegister extends Model
{
    protected $fillable = [
        'cash_in_hand',
        'user_id',
        'warehouse_id',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'cash_in_hand' => 'float',
            'user_id' => 'integer',
            'warehouse_id' => 'integer',
            'status' => 'boolean',
        ];
    }
}
