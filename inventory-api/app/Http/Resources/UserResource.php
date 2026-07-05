<?php

namespace App\Http\Resources;

use App\Models\Biller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
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
            'permissions' => $this->permissionNames(),
            'direct_permissions' => $this->getDirectPermissions()->sortBy('name')->values(),
            'is_active' => $this->is_active,
            'is_deleted' => $this->is_deleted,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
