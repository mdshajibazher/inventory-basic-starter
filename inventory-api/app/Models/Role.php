<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Spatie\Permission\Models\Role as SpatieRole;

class Role extends SpatieRole
{
    use LogsBusinessActivity;

    protected $fillable = [
        'name',
        'guard_name',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
