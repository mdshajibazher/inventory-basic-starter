<?php

namespace App\Services;

class SensitivePermissionCatalog
{
    public const SUPER_USER_WARNING = 'Super User can view and change all General Settings and grant or revoke financial approval permissions. It does not automatically approve transactions. Keep at least one active Super User.';

    public const APPROVAL_WARNING = 'Approving these records posts stock and financial effects. Grant only to trusted staff with the required module access.';

    public const SUPER_USER = 'super-user';

    public const APPROVAL_SALES_INVOICE = 'approvals-sales-invoice';

    public const APPROVAL_SALES_RETURN_INVOICE = 'approvals-sales-return-invoice';

    public const APPROVAL_PURCHASE_INVOICE = 'approvals-purchase-invoice';

    public const APPROVAL_PURCHASE_RETURN_INVOICE = 'approvals-purchase-return-invoice';

    public const APPROVAL_PAYMENTS = 'approvals-payments';

    private const APPROVAL_PERMISSIONS_BY_TYPE = [
        'sales' => self::APPROVAL_SALES_INVOICE,
        'returns' => self::APPROVAL_SALES_RETURN_INVOICE,
        'purchases' => self::APPROVAL_PURCHASE_INVOICE,
        'purchase_returns' => self::APPROVAL_PURCHASE_RETURN_INVOICE,
        'payments' => self::APPROVAL_PAYMENTS,
    ];

    private const RETIRED_GENERAL_SETTINGS_PERMISSIONS = [
        'general-settings-index',
        'general-settings-add',
        'general-settings-edit',
        'general-settings-delete',
    ];

    public function all(): array
    {
        return [
            self::SUPER_USER,
            self::APPROVAL_SALES_INVOICE,
            self::APPROVAL_SALES_RETURN_INVOICE,
            self::APPROVAL_PURCHASE_INVOICE,
            self::APPROVAL_PURCHASE_RETURN_INVOICE,
            self::APPROVAL_PAYMENTS,
        ];
    }

    public function approvalPermissionFor(string $type): ?string
    {
        return self::APPROVAL_PERMISSIONS_BY_TYPE[$type] ?? null;
    }

    public function retiredGeneralSettingsPermissions(): array
    {
        return self::RETIRED_GENERAL_SETTINGS_PERMISSIONS;
    }

    public function legacyApproverPermissionMap(): array
    {
        return [
            'sales_invoice_approver_ids' => [self::APPROVAL_SALES_INVOICE],
            'return_invoice_approver_ids' => [self::APPROVAL_SALES_RETURN_INVOICE],
            'purchase_invoice_approver_ids' => [
                self::APPROVAL_PURCHASE_INVOICE,
                self::APPROVAL_PURCHASE_RETURN_INVOICE,
            ],
            'payment_approver_ids' => [self::APPROVAL_PAYMENTS],
        ];
    }

    public function isSensitive(string $permission): bool
    {
        return in_array($permission, $this->all(), true);
    }

    public function isRetiredGeneralSettingsPermission(string $permission): bool
    {
        return in_array($permission, self::RETIRED_GENERAL_SETTINGS_PERMISSIONS, true);
    }

    public function isOrdinary(string $permission): bool
    {
        return ! $this->isSensitive($permission) && ! $this->isRetiredGeneralSettingsPermission($permission);
    }

    public function filterOrdinaryPermissions(array $permissions): array
    {
        return array_values(array_filter($permissions, fn (string $permission): bool => $this->isOrdinary($permission)));
    }

    public function ordered(array $permissions): array
    {
        return array_values(array_filter($this->all(), fn (string $permission): bool => in_array($permission, $permissions, true)));
    }

    public function metadata(): array
    {
        return array_map(fn (string $permission): array => [
            'name' => $permission,
            'label' => match ($permission) {
                self::SUPER_USER => 'Super User',
                self::APPROVAL_SALES_INVOICE => 'Approve Sales Invoices',
                self::APPROVAL_SALES_RETURN_INVOICE => 'Approve Sales Return Invoices',
                self::APPROVAL_PURCHASE_INVOICE => 'Approve Purchase Invoices',
                self::APPROVAL_PURCHASE_RETURN_INVOICE => 'Approve Purchase Return Invoices',
                self::APPROVAL_PAYMENTS => 'Approve Payments',
            },
            'category' => $permission === self::SUPER_USER ? 'super-user' : 'approval',
            'warning' => $permission === self::SUPER_USER ? self::SUPER_USER_WARNING : self::APPROVAL_WARNING,
        ], $this->all());
    }
}
