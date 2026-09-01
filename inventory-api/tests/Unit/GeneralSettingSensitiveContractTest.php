<?php

namespace Tests\Unit;

use App\Http\Resources\GeneralSettingResource;
use App\Models\GeneralSetting;
use Illuminate\Http\Request;
use Tests\TestCase;

class GeneralSettingSensitiveContractTest extends TestCase
{
    public function test_runtime_payload_omits_legacy_approver_id_fields(): void
    {
        $setting = (new GeneralSetting)->forceFill([
            'id' => 1,
            'site_title' => 'Inventory',
            'sales_invoice_approver_ids' => [10],
            'return_invoice_approver_ids' => [11],
            'purchase_invoice_approver_ids' => [12],
            'payment_approver_ids' => [13],
        ]);

        $payload = (new GeneralSettingResource($setting))->toArray(Request::create('/api/general-settings'));

        foreach ([
            'sales_invoice_approver_ids',
            'return_invoice_approver_ids',
            'purchase_invoice_approver_ids',
            'payment_approver_ids',
        ] as $legacyField) {
            $this->assertArrayNotHasKey($legacyField, $payload);
        }
    }
}
