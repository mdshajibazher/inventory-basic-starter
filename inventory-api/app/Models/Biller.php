<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;

class Biller extends Model
{
    use LogsBusinessActivity;

    protected $fillable = [
        'name',
        'image',
        'company_name',
        'vat_number',
        'email',
        'phone_number',
        'address',
        'city',
        'state',
        'postal_code',
        'country',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
