<?php

namespace App\Http\Resources;

use App\Services\EffectivePermissionService;
use App\Services\SensitivePermissionAssignmentService;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $catalog = app(SensitivePermissionCatalog::class);
        $permissions = $this->relationLoaded('permissions') ? $this->permissions : $this->permissions()->get();
        $canManageSensitive = $request->user()
            && app(EffectivePermissionService::class)->userHasPermission($request->user(), SensitivePermissionCatalog::SUPER_USER);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'guard_name' => $this->guard_name,
            'description' => $this->description,
            'is_active' => $this->is_active,
            'permissions' => $permissions
                ->filter(fn ($permission): bool => $catalog->isOrdinary($permission->name))
                ->values(),
            'sensitive_permissions' => $this->when(
                $canManageSensitive,
                fn (): array => app(SensitivePermissionAssignmentService::class)->directPermissionNames($this->resource),
            ),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
