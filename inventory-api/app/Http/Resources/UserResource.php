<?php

namespace App\Http\Resources;

use App\Models\Biller;
use App\Services\EffectivePermissionService;
use App\Services\SensitivePermissionAssignmentService;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $catalog = app(SensitivePermissionCatalog::class);
        $canManageSensitive = $request->user()
            && app(EffectivePermissionService::class)->userHasPermission($request->user(), SensitivePermissionCatalog::SUPER_USER);
        $isCurrentUserPayload = $request->route()?->uri() === 'api/me';

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'role_id' => $this->role_id,
            'current_biller_id' => $this->current_biller_id,
            'current_biller' => $this->whenLoaded('currentBiller'),
            'biller_ids' => $this->biller_ids ?? [],
            'billers' => Biller::query()
                ->whereIn('id', $this->biller_ids ?? [])
                ->orderBy('name')
                ->get(['id', 'name', 'company_name']),
            'roles' => $this->whenLoaded('roles'),
            'permissions' => $isCurrentUserPayload
                ? $this->permissionNames()
                : $catalog->filterOrdinaryPermissions($this->permissionNames()),
            'direct_permissions' => $this->getDirectPermissions()
                ->filter(fn ($permission): bool => $catalog->isOrdinary($permission->name))
                ->sortBy('name')
                ->values(),
            'sensitive_permissions' => $this->when($canManageSensitive, function (): array {
                $sensitive = app(SensitivePermissionAssignmentService::class)->userPayload($this->resource);

                return [
                    'direct' => $sensitive['direct_permissions'],
                    'inherited' => $sensitive['inherited_permissions'],
                    'effective' => $sensitive['effective_permissions'],
                ];
            }),
            'is_active' => $this->is_active,
            'is_deleted' => $this->is_deleted,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
