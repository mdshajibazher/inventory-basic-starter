<?php

namespace App\Services;

use App\Models\Biller;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class LoginContextService
{
    public function selectBranch(User $user, ?int $billerId): array
    {
        $allowedBranches = Biller::query()
            ->whereIn('id', $user->allowedBillerIds())
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'company_name', 'email', 'phone_number', 'address', 'city']);

        if ($allowedBranches->isEmpty()) {
            throw ValidationException::withMessages([
                'biller_id' => ['No active branch is assigned to this user.'],
            ]);
        }

        if (empty($billerId) && $allowedBranches->count() > 1) {
            return ['requires_branch' => true, 'branches' => $allowedBranches];
        }

        $selectedBillerId = empty($billerId)
            ? (int) $allowedBranches->first()->id
            : (int) $billerId;
        if (! $allowedBranches->contains('id', $selectedBillerId)) {
            throw ValidationException::withMessages([
                'biller_id' => ['The selected branch is not assigned to this user.'],
            ]);
        }

        return ['biller_id' => $selectedBillerId];
    }

    public function userPayload(User $user): array
    {
        $user->loadMissing('roles:id,name', 'currentBiller:id,name,company_name,email,phone_number,address,city');
        $role = $user->roles->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role_id' => $role?->id ?? $user->role_id,
            'role' => $role,
            'current_biller_id' => $user->current_biller_id,
            'current_biller' => $user->currentBiller,
            'biller_ids' => $user->biller_ids ?? [],
            'roles' => $user->getRoleNames()->values()->all(),
            'permissions' => app(EffectivePermissionService::class)->permissionNames($user),
        ];
    }
}
