<?php

namespace App\Models;

use App\Models\Concerns\LogsBusinessActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\Traits\CausesActivity;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use CausesActivity, HasApiTokens, HasFactory, HasRoles, LogsBusinessActivity, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'company_name',
        'role_id',
        'biller_id',
        'current_biller_id',
        'biller_ids',
        'warehouse_id',
        'is_active',
        'is_deleted',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'biller_ids' => 'array',
            'current_biller_id' => 'integer',
            'is_active' => 'boolean',
            'is_deleted' => 'boolean',
        ];
    }

    public function currentBiller()
    {
        return $this->belongsTo(Biller::class, 'current_biller_id');
    }

    public function allowedBillers()
    {
        return Biller::query()->whereIn('id', $this->allowedBillerIds());
    }

    public function allowedBillerIds(): array
    {
        return array_values(array_unique(array_filter(array_map(
            'intval',
            $this->biller_ids ?? ($this->biller_id ? [$this->biller_id] : [])
        ))));
    }

    public function canUseBiller(int $billerId): bool
    {
        return in_array($billerId, $this->allowedBillerIds(), true);
    }

    public function requireCurrentBillerId(): int
    {
        if ($this->current_biller_id && $this->canUseBiller((int) $this->current_biller_id)) {
            return (int) $this->current_biller_id;
        }

        $fallback = $this->allowedBillerIds()[0] ?? null;
        if ($fallback) {
            $this->forceFill(['current_biller_id' => $fallback])->save();

            return $fallback;
        }

        throw \Illuminate\Validation\ValidationException::withMessages([
            'biller_id' => ['A branch must be assigned before this action can be performed.'],
        ]);
    }

    public function stockMovements()
    {
        return $this->hasMany(StockMovement::class);
    }

    public function canAccessSystem(): bool
    {
        return $this->is_active && ! $this->is_deleted;
    }

    public function permissionNames(): array
    {
        return $this->getAllPermissions()->sortBy('name')->pluck('name')->values()->all();
    }
}
