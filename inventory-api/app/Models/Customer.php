<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = [
        'customer_group_id',
        'user_id',
        'name',
        'company_name',
        'email',
        'phone_number',
        'tax_no',
        'address',
        'city',
        'state',
        'postal_code',
        'country',
        'deposit',
        'expense',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'customer_group_id' => 'integer',
            'user_id' => 'integer',
            'deposit' => 'float',
            'expense' => 'float',
            'is_active' => 'boolean',
        ];
    }

    public function customerGroup(): BelongsTo
    {
        return $this->belongsTo(CustomerGroup::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
