<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

class GeneralSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'site_title' => $this->site_title,
            'site_logo' => $this->site_logo ? $this->imageUrl($request, $this->site_logo) : null,
            'favicon' => $this->favicon ? $this->imageUrl($request, $this->favicon) : null,
            'company_name' => $this->company_name,
            'company_address' => $this->company_address,
            'company_email' => $this->company_email,
            'company_phone' => $this->company_phone,
            'currency' => $this->currency,
            'currency_position' => $this->currency_position,
            'staff_access' => $this->staff_access,
            'date_format' => $this->date_format,
            'developed_by' => $this->developed_by,
            'invoice_format' => $this->invoice_format,
            'state' => $this->state,
            'theme' => $this->theme,
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
