<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SmsLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'user_name' => $this->whenLoaded('user', fn () => $this->user?->name),
            'user_email' => $this->whenLoaded('user', fn () => $this->user?->email),
            'phone_number' => $this->phone_number,
            'message' => $this->message,
            'status' => $this->status,
            'provider' => $this->provider,
            'provider_response' => $this->provider_response,
            'record_type' => $this->record_type,
            'record_id' => $this->record_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
