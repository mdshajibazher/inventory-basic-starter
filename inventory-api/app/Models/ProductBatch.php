<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductBatch extends Model
{
    protected $fillable = [
        'product_id',
        'batch_no',
        'expired_date',
        'qty',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'expired_date' => 'date',
            'qty' => 'float',
        ];
    }
}
