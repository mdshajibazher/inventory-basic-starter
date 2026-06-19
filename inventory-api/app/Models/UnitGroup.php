<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UnitGroup extends Model
{
    protected $fillable = [
        'title',
    ];

    public function units(): HasMany
    {
        return $this->hasMany(Unit::class);
    }
}
