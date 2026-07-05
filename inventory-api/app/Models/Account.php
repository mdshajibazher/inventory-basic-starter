<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends Model
{
    use LogsBusinessActivity;

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

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
