<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GeneralSetting extends Model
{
    protected $fillable = [
        'site_title',
        'site_logo',
        'favicon',
        'company_name',
        'company_address',
        'company_email',
        'company_phone',
        'bulksmsbd_api_url',
        'bulksmsbd_api_key',
        'bulksmsbd_sender_id',
        'sales_invoice_approver_ids',
        'return_invoice_approver_ids',
        'purchase_invoice_approver_ids',
        'payment_approver_ids',
        'sales_invoice_mail_notification_enabled',
        'sales_invoice_mail_notification_user_ids',
        'sales_invoice_sms_notification_enabled',
        'sales_invoice_sms_notification_user_ids',
        'return_invoice_mail_notification_enabled',
        'return_invoice_mail_notification_user_ids',
        'return_invoice_sms_notification_enabled',
        'return_invoice_sms_notification_user_ids',
        'purchase_invoice_mail_notification_enabled',
        'purchase_invoice_mail_notification_user_ids',
        'purchase_invoice_sms_notification_enabled',
        'purchase_invoice_sms_notification_user_ids',
        'payment_mail_notification_enabled',
        'payment_mail_notification_user_ids',
        'payment_sms_notification_enabled',
        'payment_sms_notification_user_ids',
        'customer_sales_invoice_sms_notification_enabled',
        'customer_sales_invoice_mail_notification_enabled',
        'customer_return_invoice_sms_notification_enabled',
        'customer_return_invoice_mail_notification_enabled',
        'currency',
        'currency_position',
        'staff_access',
        'date_format',
        'developed_by',
        'invoice_format',
        'state',
        'theme',
    ];

    protected function casts(): array
    {
        return [
            'sales_invoice_approver_ids' => 'array',
            'return_invoice_approver_ids' => 'array',
            'purchase_invoice_approver_ids' => 'array',
            'payment_approver_ids' => 'array',
            'sales_invoice_mail_notification_enabled' => 'boolean',
            'sales_invoice_mail_notification_user_ids' => 'array',
            'sales_invoice_sms_notification_enabled' => 'boolean',
            'sales_invoice_sms_notification_user_ids' => 'array',
            'return_invoice_mail_notification_enabled' => 'boolean',
            'return_invoice_mail_notification_user_ids' => 'array',
            'return_invoice_sms_notification_enabled' => 'boolean',
            'return_invoice_sms_notification_user_ids' => 'array',
            'purchase_invoice_mail_notification_enabled' => 'boolean',
            'purchase_invoice_mail_notification_user_ids' => 'array',
            'purchase_invoice_sms_notification_enabled' => 'boolean',
            'purchase_invoice_sms_notification_user_ids' => 'array',
            'payment_mail_notification_enabled' => 'boolean',
            'payment_mail_notification_user_ids' => 'array',
            'payment_sms_notification_enabled' => 'boolean',
            'payment_sms_notification_user_ids' => 'array',
            'customer_sales_invoice_sms_notification_enabled' => 'boolean',
            'customer_sales_invoice_mail_notification_enabled' => 'boolean',
            'customer_return_invoice_sms_notification_enabled' => 'boolean',
            'customer_return_invoice_mail_notification_enabled' => 'boolean',
        ];
    }
}
