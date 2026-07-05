<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    use LogsBusinessActivity;

    protected $fillable = [
        'name',
        'code',
        'exchange_rate',
    ];

    protected function casts(): array
    {
        return [
            'exchange_rate' => 'float',
        ];
    }
}
