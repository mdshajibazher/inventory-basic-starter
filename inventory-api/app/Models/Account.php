<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    protected $fillable = [
        'account_no',
        'name',
        'initial_balance',
        'total_balance',
        'note',
        'is_default',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'initial_balance' => 'float',
            'total_balance' => 'float',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
