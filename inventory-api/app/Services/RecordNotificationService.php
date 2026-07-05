<?php

namespace App\Services;

use App\Models\EmailLog;
use App\Models\GeneralSetting;
use App\Models\Payment;
use App\Models\Purchase;
use App\Models\ReturnInvoice;
use App\Models\Sale;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class RecordNotificationService
{
    public function salesInvoiceCreatedForCustomer(Sale $sale): void
    {
        $sale->loadMissing(['customer:id,name,email,phone_number', 'user:id,name']);
        $setting = $this->setting();

        if (! $setting) {
            return;
        }

        $this->sendCustomer(
            'customer_sales_invoice',
            'Sales Invoice Created',
            $sale,
            [
                'reference' => $sale->reference_no,
                'party' => $sale->customer?->name,
                'amount' => $sale->grand_total,
                'creator' => $sale->user?->name,
            ],
            (bool) $setting->customer_sales_invoice_mail_notification_enabled,
            (bool) $setting->customer_sales_invoice_sms_notification_enabled,
            $sale->customer?->email,
            $sale->customer?->phone_number
        );
    }

    public function returnInvoiceCreatedForCustomer(ReturnInvoice $returnInvoice): void
    {
        $returnInvoice->loadMissing(['customer:id,name,email,phone_number', 'user:id,name']);
        $setting = $this->setting();

        if (! $setting) {
            return;
        }

        $this->sendCustomer(
            'customer_return_invoice',
            'Return Invoice Created',
            $returnInvoice,
            [
                'reference' => $returnInvoice->reference_no,
                'party' => $returnInvoice->customer?->name,
                'amount' => $returnInvoice->grand_total,
                'creator' => $returnInvoice->user?->name,
            ],
            (bool) $setting->customer_return_invoice_mail_notification_enabled,
            (bool) $setting->customer_return_invoice_sms_notification_enabled,
            $returnInvoice->customer?->email,
            $returnInvoice->customer?->phone_number
        );
    }

    public function salesInvoiceApproved(Sale $sale): void
    {
        $sale->loadMissing(['customer:id,name', 'user:id,name']);
        $this->send('sales_invoice', 'Sales Invoice Approved', $sale, [
            'reference' => $sale->reference_no,
            'party' => $sale->customer?->name,
            'amount' => $sale->grand_total,
            'creator' => $sale->user?->name,
        ]);
    }

    public function returnInvoiceApproved(ReturnInvoice $returnInvoice): void
    {
        $returnInvoice->loadMissing(['customer:id,name', 'user:id,name']);
        $this->send('return_invoice', 'Return Invoice Approved', $returnInvoice, [
            'reference' => $returnInvoice->reference_no,
            'party' => $returnInvoice->customer?->name,
            'amount' => $returnInvoice->grand_total,
            'creator' => $returnInvoice->user?->name,
        ]);
    }

    public function purchaseInvoiceApproved(Purchase $purchase): void
    {
        $purchase->loadMissing(['supplier:id,name', 'user:id,name']);
        $this->send('purchase_invoice', 'Purchase Invoice Approved', $purchase, [
            'reference' => $purchase->reference_no,
            'party' => $purchase->supplier?->name,
            'amount' => $purchase->grand_total,
            'creator' => $purchase->user?->name,
        ]);
    }

    public function paymentApproved(Payment $payment): void
    {
        $payment->loadMissing(['customer:id,name', 'supplier:id,name', 'user:id,name']);
        $this->send('payment', 'Payment Approved', $payment, [
            'reference' => $payment->payment_reference,
            'party' => $payment->customer?->name ?? $payment->supplier?->name,
            'amount' => $payment->amount,
            'creator' => $payment->user?->name,
        ]);
    }

    private function send(string $type, string $title, Model $record, array $context): void
    {
        $setting = $this->setting();

        if (! $setting) {
            return;
        }

        $subject = "{$title}: {$context['reference']}";
        $message = $this->message($title, $context);

        if ($setting->{"{$type}_mail_notification_enabled"}) {
            $this->sendMail($type, $record, $subject, $message, $setting->{"{$type}_mail_notification_user_ids"} ?? []);
        }

        if ($setting->{"{$type}_sms_notification_enabled"}) {
            $this->sendSms($type, $record, $setting, $message, $setting->{"{$type}_sms_notification_user_ids"} ?? []);
        }
    }

    private function sendCustomer(
        string $type,
        string $title,
        Model $record,
        array $context,
        bool $mailEnabled,
        bool $smsEnabled,
        ?string $email,
        ?string $phoneNumber
    ): void {
        $setting = $this->setting();

        if (! $setting) {
            return;
        }

        $subject = "{$title}: {$context['reference']}";
        $message = $this->message($title, $context);

        if ($mailEnabled && $email) {
            $this->sendMailToAddress($type, $record, $subject, $message, $email);
        }

        if ($smsEnabled && $phoneNumber) {
            $this->sendSmsToNumber($type, $record, $setting, $message, $phoneNumber);
        }
    }

    private function sendMail(string $type, Model $record, string $subject, string $message, array $userIds): void
    {
        $users = User::query()->whereIn('id', $userIds)->whereNotNull('email')->get(['id', 'email']);

        foreach ($users as $user) {
            $this->sendMailToAddress($type, $record, $subject, $message, $user->email, $user);
        }
    }

    private function sendMailToAddress(
        string $type,
        Model $record,
        string $subject,
        string $message,
        string $email,
        ?User $user = null
    ): void {
        try {
            Mail::raw($message, fn ($mail) => $mail->to($email)->subject($subject));
            $this->logEmail($type, $record, $email, $subject, $message, 'submitted', null, $user);
        } catch (Throwable $exception) {
            Log::error('Record mail notification failed.', [
                'type' => $type,
                'record_id' => $record->getKey(),
                'user_id' => $user?->id,
                'email' => $email,
                'exception' => $exception,
            ]);

            $this->logEmail($type, $record, $email, $subject, $message, 'error', $exception->getMessage(), $user);
        }
    }

    private function logEmail(
        string $type,
        Model $record,
        string $email,
        string $subject,
        string $message,
        string $status,
        ?string $providerResponse = null,
        ?User $user = null
    ): void {
        try {
            EmailLog::query()->create([
                'user_id' => $user?->id,
                'email' => $email,
                'subject' => $subject,
                'message' => $message,
                'status' => $status,
                'provider' => config('mail.default'),
                'provider_response' => $providerResponse,
                'record_type' => $type,
                'record_id' => $record->getKey(),
            ]);
        } catch (Throwable $exception) {
            Log::error('Email notification log write failed.', [
                'type' => $type,
                'record_id' => $record->getKey(),
                'user_id' => $user?->id,
                'email' => $email,
                'exception' => $exception,
            ]);
        }
    }

    private function sendSms(string $type, Model $record, GeneralSetting $setting, string $message, array $userIds): void
    {
        $apiKey = $setting->bulksmsbd_api_key;
        $senderId = $setting->bulksmsbd_sender_id;
        $apiUrl = $setting->bulksmsbd_api_url;
        $users = User::query()->whereIn('id', $userIds)->whereNotNull('phone')->get(['id', 'phone']);

        if (! $apiKey || ! $senderId || ! $apiUrl) {
            Log::warning('Bulk SMS BD notification skipped because provider config is missing.', [
                'type' => $type,
                'record_id' => $record->getKey(),
            ]);

            foreach ($users as $user) {
                $this->logSms($type, $record, $user->phone, $message, 'skipped', 'Bulk SMS BD config missing.', $user);
            }

            return;
        }

        foreach ($users as $user) {
            $this->sendSmsToNumber($type, $record, $setting, $message, $user->phone, $user);
        }
    }

    private function sendSmsToNumber(
        string $type,
        Model $record,
        GeneralSetting $setting,
        string $message,
        string $phoneNumber,
        ?User $user = null
    ): void {
        $apiKey = $setting->bulksmsbd_api_key;
        $senderId = $setting->bulksmsbd_sender_id;
        $apiUrl = $setting->bulksmsbd_api_url;

        if (! $apiKey || ! $senderId || ! $apiUrl) {
            Log::warning('Bulk SMS BD notification skipped because provider config is missing.', [
                'type' => $type,
                'record_id' => $record->getKey(),
                'user_id' => $user?->id,
                'phone_number' => $phoneNumber,
            ]);

            $this->logSms($type, $record, $phoneNumber, $message, 'skipped', 'Bulk SMS BD config missing.', $user);

            return;
        }

        try {
            $response = Http::timeout(10)->get($apiUrl, [
                'api_key' => $apiKey,
                'senderid' => $senderId,
                'type' => 'text',
                'number' => $phoneNumber,
                'message' => $message,
            ]);
            $responseBody = trim($response->body());

            $this->logSms(
                $type,
                $record,
                $phoneNumber,
                $message,
                $responseBody === '202' ? 'submitted' : 'failed',
                $response->body(),
                $user
            );

            if ($responseBody !== '202') {
                Log::warning('Bulk SMS BD notification returned non-success response.', [
                    'type' => $type,
                    'record_id' => $record->getKey(),
                    'user_id' => $user?->id,
                    'phone_number' => $phoneNumber,
                    'response' => $response->body(),
                ]);
            }
        } catch (Throwable $exception) {
            Log::error('Bulk SMS BD notification failed.', [
                'type' => $type,
                'record_id' => $record->getKey(),
                'user_id' => $user?->id,
                'phone_number' => $phoneNumber,
                'exception' => $exception,
            ]);

            $this->logSms($type, $record, $phoneNumber, $message, 'error', $exception->getMessage(), $user);
        }
    }

    private function logSms(
        string $type,
        Model $record,
        string $phoneNumber,
        string $message,
        string $status,
        ?string $providerResponse = null,
        ?User $user = null
    ): void {
        try {
            SmsLog::query()->create([
                'user_id' => $user?->id,
                'phone_number' => $phoneNumber,
                'message' => $message,
                'status' => $status,
                'provider' => 'bulksmsbd',
                'provider_response' => $providerResponse,
                'record_type' => $type,
                'record_id' => $record->getKey(),
            ]);
        } catch (Throwable $exception) {
            Log::error('SMS notification log write failed.', [
                'type' => $type,
                'record_id' => $record->getKey(),
                'user_id' => $user?->id,
                'phone_number' => $phoneNumber,
                'exception' => $exception,
            ]);
        }
    }

    private function setting(): ?GeneralSetting
    {
        return GeneralSetting::query()->latest('id')->first();
    }

    private function message(string $title, array $context): string
    {
        $lines = [
            $title,
            'Reference: '.$context['reference'],
            'Amount: '.number_format((float) ($context['amount'] ?? 0), 2),
            'Date: '.now()->toDateTimeString(),
        ];

        if (! empty($context['party'])) {
            $lines[] = 'Party: '.$context['party'];
        }

        if (! empty($context['creator'])) {
            $lines[] = 'Created by: '.$context['creator'];
        }

        return implode("\n", $lines);
    }
}
