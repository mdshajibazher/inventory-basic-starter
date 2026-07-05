<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ActivityLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $attributes = (array) data_get($this->properties, 'attributes', []);
        $old = (array) data_get($this->properties, 'old', []);

        return [
            'id' => $this->id,
            'log_name' => $this->log_name,
            'event' => $this->event,
            'description' => $this->description,
            'causer' => $this->when($this->relationLoaded('causer') && $this->causer, fn () => [
                'id' => $this->causer->getKey(),
                'name' => $this->causer->name ?? $this->causer->email ?? class_basename($this->causer),
                'email' => $this->causer->email ?? null,
            ]),
            'changes' => collect($attributes)
                ->map(fn ($value, string $field): array => [
                    'field' => $field,
                    'old' => array_key_exists($field, $old) ? $old[$field] : null,
                    'new' => $value,
                ])
                ->values(),
            'created_at' => $this->created_at,
        ];
    }
}
