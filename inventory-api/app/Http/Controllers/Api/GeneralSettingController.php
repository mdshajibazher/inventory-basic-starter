<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GeneralSettingResource;
use App\Models\GeneralSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class GeneralSettingController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return GeneralSettingResource::collection(
            GeneralSetting::query()
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('site_title', 'like', "%{$term}%")
                                ->orWhere('company_name', 'like', "%{$term}%")
                                ->orWhere('company_address', 'like', "%{$term}%")
                                ->orWhere('company_email', 'like', "%{$term}%")
                                ->orWhere('company_phone', 'like', "%{$term}%");
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function store(Request $request)
    {
        $data = [
            ...$this->storeDefaults(),
            ...$this->validatedData($request),
        ];

        if ($request->hasFile('site_logo')) {
            $data['site_logo'] = $request->file('site_logo')->store('general-settings', 'public');
        }

        if ($request->hasFile('favicon')) {
            $data['favicon'] = $request->file('favicon')->store('general-settings', 'public');
        }

        unset($data['remove_site_logo'], $data['remove_favicon']);

        $setting = GeneralSetting::create([
            ...$data,
        ]);

        return response()->json([
            'message' => 'General settings created successfully.',
            'data' => new GeneralSettingResource($setting),
        ], 201);
    }

    public function show(GeneralSetting $generalSetting)
    {
        return response()->json([
            'data' => new GeneralSettingResource($generalSetting),
        ]);
    }

    public function update(Request $request, GeneralSetting $generalSetting)
    {
        $data = $this->validatedData($request);

        if ($request->boolean('remove_site_logo') && $generalSetting->site_logo) {
            Storage::disk('public')->delete($generalSetting->site_logo);
            $data['site_logo'] = null;
        }

        if ($request->boolean('remove_favicon') && $generalSetting->favicon) {
            Storage::disk('public')->delete($generalSetting->favicon);
            $data['favicon'] = null;
        }

        if ($request->hasFile('site_logo')) {
            if ($generalSetting->site_logo) {
                Storage::disk('public')->delete($generalSetting->site_logo);
            }

            $data['site_logo'] = $request->file('site_logo')->store('general-settings', 'public');
        }

        if ($request->hasFile('favicon')) {
            if ($generalSetting->favicon) {
                Storage::disk('public')->delete($generalSetting->favicon);
            }

            $data['favicon'] = $request->file('favicon')->store('general-settings', 'public');
        }

        unset($data['remove_site_logo'], $data['remove_favicon']);

        $generalSetting->update($data);

        return response()->json([
            'message' => 'General settings updated successfully.',
            'data' => new GeneralSettingResource($generalSetting),
        ]);
    }

    public function destroy(GeneralSetting $generalSetting)
    {
        if ($generalSetting->site_logo) {
            Storage::disk('public')->delete($generalSetting->site_logo);
        }

        if ($generalSetting->favicon) {
            Storage::disk('public')->delete($generalSetting->favicon);
        }

        $generalSetting->delete();

        return response()->json([
            'message' => 'General settings deleted successfully.',
        ]);
    }

    private function validatedData(Request $request): array
    {
        $data = $request->validate([
            'site_title' => ['required', 'string', 'max:255'],
            'site_logo' => ['nullable', 'image', 'max:2048'],
            'favicon' => ['nullable', 'image', 'max:2048'],
            'remove_site_logo' => ['nullable', 'boolean'],
            'remove_favicon' => ['nullable', 'boolean'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'company_address' => ['nullable', 'string'],
            'company_email' => ['nullable', 'email', 'max:255'],
            'company_phone' => ['nullable', 'string', 'max:255'],
            'bulksmsbd_api_url' => ['nullable', 'url', 'max:255'],
            'bulksmsbd_api_key' => ['nullable', 'string', 'max:255'],
            'bulksmsbd_sender_id' => ['nullable', 'string', 'max:255'],
            'sales_invoice_approver_ids' => ['nullable', 'array'],
            'sales_invoice_approver_ids.*' => ['integer', 'exists:users,id'],
            'return_invoice_approver_ids' => ['nullable', 'array'],
            'return_invoice_approver_ids.*' => ['integer', 'exists:users,id'],
            'purchase_invoice_approver_ids' => ['nullable', 'array'],
            'purchase_invoice_approver_ids.*' => ['integer', 'exists:users,id'],
            'payment_approver_ids' => ['nullable', 'array'],
            'payment_approver_ids.*' => ['integer', 'exists:users,id'],
            'sales_invoice_mail_notification_enabled' => ['nullable', 'boolean'],
            'sales_invoice_mail_notification_user_ids' => ['nullable', 'array'],
            'sales_invoice_mail_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'sales_invoice_sms_notification_enabled' => ['nullable', 'boolean'],
            'sales_invoice_sms_notification_user_ids' => ['nullable', 'array'],
            'sales_invoice_sms_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'return_invoice_mail_notification_enabled' => ['nullable', 'boolean'],
            'return_invoice_mail_notification_user_ids' => ['nullable', 'array'],
            'return_invoice_mail_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'return_invoice_sms_notification_enabled' => ['nullable', 'boolean'],
            'return_invoice_sms_notification_user_ids' => ['nullable', 'array'],
            'return_invoice_sms_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'purchase_invoice_mail_notification_enabled' => ['nullable', 'boolean'],
            'purchase_invoice_mail_notification_user_ids' => ['nullable', 'array'],
            'purchase_invoice_mail_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'purchase_invoice_sms_notification_enabled' => ['nullable', 'boolean'],
            'purchase_invoice_sms_notification_user_ids' => ['nullable', 'array'],
            'purchase_invoice_sms_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'payment_mail_notification_enabled' => ['nullable', 'boolean'],
            'payment_mail_notification_user_ids' => ['nullable', 'array'],
            'payment_mail_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'payment_sms_notification_enabled' => ['nullable', 'boolean'],
            'payment_sms_notification_user_ids' => ['nullable', 'array'],
            'payment_sms_notification_user_ids.*' => ['integer', 'exists:users,id'],
            'customer_sales_invoice_sms_notification_enabled' => ['nullable', 'boolean'],
            'customer_sales_invoice_mail_notification_enabled' => ['nullable', 'boolean'],
            'customer_return_invoice_sms_notification_enabled' => ['nullable', 'boolean'],
            'customer_return_invoice_mail_notification_enabled' => ['nullable', 'boolean'],
        ]);

        $arrayFields = [
            'sales_invoice_approver_ids',
            'return_invoice_approver_ids',
            'purchase_invoice_approver_ids',
            'payment_approver_ids',
            'sales_invoice_mail_notification_user_ids',
            'sales_invoice_sms_notification_user_ids',
            'return_invoice_mail_notification_user_ids',
            'return_invoice_sms_notification_user_ids',
            'purchase_invoice_mail_notification_user_ids',
            'purchase_invoice_sms_notification_user_ids',
            'payment_mail_notification_user_ids',
            'payment_sms_notification_user_ids',
        ];

        foreach ($arrayFields as $field) {
            $data[$field] = array_values(array_map('intval', $data[$field] ?? []));
        }

        foreach ([
            'sales_invoice_mail_notification_enabled',
            'sales_invoice_sms_notification_enabled',
            'return_invoice_mail_notification_enabled',
            'return_invoice_sms_notification_enabled',
            'purchase_invoice_mail_notification_enabled',
            'purchase_invoice_sms_notification_enabled',
            'payment_mail_notification_enabled',
            'payment_sms_notification_enabled',
            'customer_sales_invoice_sms_notification_enabled',
            'customer_sales_invoice_mail_notification_enabled',
            'customer_return_invoice_sms_notification_enabled',
            'customer_return_invoice_mail_notification_enabled',
        ] as $field) {
            $data[$field] = (bool) ($data[$field] ?? false);
        }

        return $data;
    }

    private function storeDefaults(): array
    {
        return [
            'currency' => '1',
            'currency_position' => 'prefix',
            'staff_access' => 'own',
            'date_format' => 'd/m/Y',
            'theme' => 'default.css',
            'bulksmsbd_api_url' => 'http://bulksmsbd.net/api/smsapi',
        ];
    }
}
