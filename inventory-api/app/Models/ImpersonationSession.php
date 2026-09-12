<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ImpersonationSession extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['ended_at' => 'datetime', 'biller_id' => 'integer'];
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function target()
    {
        return $this->belongsTo(User::class, 'target_id');
    }

    public function metadata(): array
    {
        return [
            'id' => $this->id,
            'actor' => $this->actor->only(['id', 'name', 'email']),
            'target' => $this->target->only(['id', 'name', 'email']),
        ];
    }
}
