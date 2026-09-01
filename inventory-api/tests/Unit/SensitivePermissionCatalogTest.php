<?php

namespace Tests\Unit;

use App\Services\SensitivePermissionCatalog;
use Tests\TestCase;

class SensitivePermissionCatalogTest extends TestCase
{
    public function test_it_exposes_the_exact_sensitive_approval_catalog_and_type_mapping(): void
    {
        $catalog = app(SensitivePermissionCatalog::class);

        $this->assertSame([
            'super-user',
            'approvals-sales-invoice',
            'approvals-sales-return-invoice',
            'approvals-purchase-invoice',
            'approvals-purchase-return-invoice',
            'approvals-payments',
        ], $catalog->all());

        $this->assertSame('approvals-sales-invoice', $catalog->approvalPermissionFor('sales'));
        $this->assertSame('approvals-sales-return-invoice', $catalog->approvalPermissionFor('returns'));
        $this->assertSame('approvals-purchase-invoice', $catalog->approvalPermissionFor('purchases'));
        $this->assertSame('approvals-purchase-return-invoice', $catalog->approvalPermissionFor('purchase_returns'));
        $this->assertSame('approvals-payments', $catalog->approvalPermissionFor('payments'));
        $this->assertNull($catalog->approvalPermissionFor('unknown'));
    }

    public function test_it_filters_sensitive_and_retired_general_settings_permissions_from_ordinary_catalogs(): void
    {
        $catalog = app(SensitivePermissionCatalog::class);

        $this->assertSame([
            'general-settings-index',
            'general-settings-add',
            'general-settings-edit',
            'general-settings-delete',
        ], $catalog->retiredGeneralSettingsPermissions());

        $this->assertSame([
            'products-index',
            'sales-edit',
        ], $catalog->filterOrdinaryPermissions([
            'super-user',
            'products-index',
            'general-settings-edit',
            'approvals-payments',
            'sales-edit',
        ]));
    }
}
