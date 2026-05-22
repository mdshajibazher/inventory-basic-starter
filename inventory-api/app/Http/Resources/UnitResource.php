<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UnitResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'unit_code' => $this->unit_code,
            'unit_name' => $this->unit_name,
            'base_unit' => $this->base_unit,
            'base_unit_name' => $this->baseUnit?->unit_name,
            'operator' => $this->operator,
            'operation_value' => $this->operation_value,
            'is_active' => $this->is_active,
            'base' => $this->whenLoaded('baseUnit'),
            'related_units' => $this->whenLoaded('relatedUnits'),
            'products' => $this->whenLoaded('products'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
