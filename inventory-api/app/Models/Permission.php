<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Spatie\Permission\Models\Permission as SpatiePermission;

class Permission extends SpatiePermission
{
    use LogsBusinessActivity;

    protected $fillable = [
        'name',
        'guard_name',
    ];
}
