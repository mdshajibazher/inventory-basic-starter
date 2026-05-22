<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'image' => $this->image ? $this->imageUrl($request, $this->image) : null,
            'parent_id' => $this->parent_id,
            'is_active' => $this->is_active,
            'parent_category_name' => $this->parent?->name,
            'parent' => $this->whenLoaded('parent'),
            'children' => $this->whenLoaded('children'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function imageUrl(Request $request, string $path): string
    {
        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return $request->getSchemeAndHttpHost().'/storage/'.$path;
    }
}
