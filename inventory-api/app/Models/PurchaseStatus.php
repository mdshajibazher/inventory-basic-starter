<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseStatus extends Model
{
    protected $fillable = [
        'value',
        'label',
    ];
}
