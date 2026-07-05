<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    use LogsBusinessActivity;

    protected $fillable = ['name', 'phone', 'email', 'address', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
