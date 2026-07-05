<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsLog extends Model
{
    protected $fillable = [
        'user_id',
        'phone_number',
        'message',
        'status',
        'provider',
        'provider_response',
        'record_type',
        'record_id',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'record_id' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
