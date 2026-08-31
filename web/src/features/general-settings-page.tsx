'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Switch } from '@/components/ui';
import { PageHeader } from '@/components/resource-shell';
import { useAuth } from '@/context/auth-context';
import { api, type GeneralSettingPayload } from '@/lib/api';
import type { GeneralSetting, User } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

type FormState = {
  siteTitle: string;
  siteLogo: File | null;
  siteLogoUrl: string;
  removeSiteLogo: boolean;
  favicon: File | null;
  faviconUrl: string;
  removeFavicon: boolean;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  bulksmsbdApiUrl: string;
  bulksmsbdApiKey: string;
  bulksmsbdSenderId: string;
  salesInvoiceApproverIds: number[];
  returnInvoiceApproverIds: number[];
  purchaseInvoiceApproverIds: number[];
  paymentApproverIds: number[];
  salesInvoiceMailNotificationEnabled: boolean;
  salesInvoiceMailNotificationUserIds: number[];
  salesInvoiceSmsNotificationEnabled: boolean;
  salesInvoiceSmsNotificationUserIds: number[];
  returnInvoiceMailNotificationEnabled: boolean;
  returnInvoiceMailNotificationUserIds: number[];
  returnInvoiceSmsNotificationEnabled: boolean;
  returnInvoiceSmsNotificationUserIds: number[];
  purchaseInvoiceMailNotificationEnabled: boolean;
  purchaseInvoiceMailNotificationUserIds: number[];
  purchaseInvoiceSmsNotificationEnabled: boolean;
  purchaseInvoiceSmsNotificationUserIds: number[];
  paymentMailNotificationEnabled: boolean;
  paymentMailNotificationUserIds: number[];
  paymentSmsNotificationEnabled: boolean;
  paymentSmsNotificationUserIds: number[];
  customerSalesInvoiceSmsNotificationEnabled: boolean;
  customerSalesInvoiceMailNotificationEnabled: boolean;
  customerReturnInvoiceSmsNotificationEnabled: boolean;
  customerReturnInvoiceMailNotificationEnabled: boolean;
};

const emptyForm: FormState = {
  siteTitle: '',
  siteLogo: null,
  siteLogoUrl: '',
  removeSiteLogo: false,
  favicon: null,
  faviconUrl: '',
  removeFavicon: false,
  companyName: '',
  companyAddress: '',
  companyEmail: '',
  companyPhone: '',
  bulksmsbdApiUrl: 'http://bulksmsbd.net/api/smsapi',
  bulksmsbdApiKey: '',
  bulksmsbdSenderId: '',
  salesInvoiceApproverIds: [],
  returnInvoiceApproverIds: [],
  purchaseInvoiceApproverIds: [],
  paymentApproverIds: [],
  salesInvoiceMailNotificationEnabled: false,
  salesInvoiceMailNotificationUserIds: [],
  salesInvoiceSmsNotificationEnabled: false,
  salesInvoiceSmsNotificationUserIds: [],
  returnInvoiceMailNotificationEnabled: false,
  returnInvoiceMailNotificationUserIds: [],
  returnInvoiceSmsNotificationEnabled: false,
  returnInvoiceSmsNotificationUserIds: [],
  purchaseInvoiceMailNotificationEnabled: false,
  purchaseInvoiceMailNotificationUserIds: [],
  purchaseInvoiceSmsNotificationEnabled: false,
  purchaseInvoiceSmsNotificationUserIds: [],
  paymentMailNotificationEnabled: false,
  paymentMailNotificationUserIds: [],
  paymentSmsNotificationEnabled: false,
  paymentSmsNotificationUserIds: [],
  customerSalesInvoiceSmsNotificationEnabled: false,
  customerSalesInvoiceMailNotificationEnabled: false,
  customerReturnInvoiceSmsNotificationEnabled: false,
  customerReturnInvoiceMailNotificationEnabled: false,
};

export function GeneralSettingsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [setting, setSetting] = useState<GeneralSetting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canAdd = hasPermission('general-settings-add');
  const canEdit = hasPermission('general-settings-edit');
  const canSave = setting ? canEdit : canAdd;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.generalSettings({ page: 1, perPage: 1 });
      const nextSetting = (response.data[0] ?? null) as GeneralSetting | null;
      setSetting(nextSetting);
      setForm(nextSetting ? toForm(nextSetting) : emptyForm);
      const options = await api.userOptions();
      setUsers(((options.data as { users?: User[] }).users ?? []) as User[]);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission('general-settings-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load();
  }, [load]);

  function setValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();

    if (!form.siteTitle.trim()) {
      toast.error('Missing site title', { description: 'Site title is required.' });
      return;
    }

    setSaving(true);
    try {
      if (setting) {
        await api.updateGeneralSetting(setting.id, payload(form));
      } else {
        await api.createGeneralSetting(payload(form));
      }

      toast.success('General settings saved');
      await load();
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="General Settings"
        subtitle={loading ? 'Loading settings...' : 'Company and app information used by reports'}
      />

      <form onSubmit={save} className="grid max-w-4xl gap-5 rounded-md border border-neutral-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Site title">
            <Input value={form.siteTitle} onChange={(event) => setValue('siteTitle', event.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImagePickerField
            label="Site logo"
            imageUrl={form.siteLogoUrl}
            file={form.siteLogo}
            remove={form.removeSiteLogo}
            onFile={(file) => {
              setValue('siteLogo', file);
              setValue('removeSiteLogo', false);
            }}
            onRemove={(remove) => {
              setValue('removeSiteLogo', remove);
              if (remove) setValue('siteLogo', null);
            }}
          />
          <ImagePickerField
            label="Favicon"
            imageUrl={form.faviconUrl}
            file={form.favicon}
            remove={form.removeFavicon}
            onFile={(file) => {
              setValue('favicon', file);
              setValue('removeFavicon', false);
            }}
            onRemove={(remove) => {
              setValue('removeFavicon', remove);
              if (remove) setValue('favicon', null);
            }}
          />
        </div>

        <section className="grid gap-4 border-t border-neutral-200 pt-4">
          <h2 className="text-base font-semibold">Approvals</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApproverPicker label="Who can approve sales invoice" users={users} selectedIds={form.salesInvoiceApproverIds} onChange={(ids) => setValue('salesInvoiceApproverIds', ids)} />
            <ApproverPicker label="Who can approve return invoice" users={users} selectedIds={form.returnInvoiceApproverIds} onChange={(ids) => setValue('returnInvoiceApproverIds', ids)} />
            <ApproverPicker label="Who can approve purchase invoice" users={users} selectedIds={form.purchaseInvoiceApproverIds} onChange={(ids) => setValue('purchaseInvoiceApproverIds', ids)} />
            <ApproverPicker label="Who can approve payments" users={users} selectedIds={form.paymentApproverIds} onChange={(ids) => setValue('paymentApproverIds', ids)} />
          </div>
        </section>

        <section className="grid gap-4 border-t border-neutral-200 pt-4">
          <h2 className="text-base font-semibold">Notifications</h2>
          <div className="grid gap-4 rounded-md border border-neutral-200 p-3 sm:grid-cols-3">
            <Field label="Bulk SMS BD API URL">
              <Input value={form.bulksmsbdApiUrl} onChange={(event) => setValue('bulksmsbdApiUrl', event.target.value)} />
            </Field>
            <Field label="Bulk SMS BD API Key">
              <Input type="password" value={form.bulksmsbdApiKey} onChange={(event) => setValue('bulksmsbdApiKey', event.target.value)} />
            </Field>
            <Field label="Bulk SMS BD Sender ID">
              <Input value={form.bulksmsbdSenderId} onChange={(event) => setValue('bulksmsbdSenderId', event.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 rounded-md border border-neutral-200 p-3">
            <h3 className="text-sm font-semibold text-neutral-900">Customer Notifications</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label="Enable Customer Sales Invoice SMS Notification" checked={form.customerSalesInvoiceSmsNotificationEnabled} onChange={(value) => setValue('customerSalesInvoiceSmsNotificationEnabled', value)} />
              <ToggleRow label="Email Approved Sales Invoices to Customers" checked={form.customerSalesInvoiceMailNotificationEnabled} onChange={(value) => setValue('customerSalesInvoiceMailNotificationEnabled', value)} />
              <ToggleRow label="Enable Customer Return Invoice SMS Notification" checked={form.customerReturnInvoiceSmsNotificationEnabled} onChange={(value) => setValue('customerReturnInvoiceSmsNotificationEnabled', value)} />
              <ToggleRow label="Enable Customer Return Invoice Email Notification" checked={form.customerReturnInvoiceMailNotificationEnabled} onChange={(value) => setValue('customerReturnInvoiceMailNotificationEnabled', value)} />
            </div>
          </div>
          <NotificationGroup
            title="Sales Invoice"
            users={users}
            mailEnabled={form.salesInvoiceMailNotificationEnabled}
            smsEnabled={form.salesInvoiceSmsNotificationEnabled}
            mailUserIds={form.salesInvoiceMailNotificationUserIds}
            smsUserIds={form.salesInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => setValue('salesInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => setValue('salesInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => setValue('salesInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => setValue('salesInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Return Invoice"
            users={users}
            mailEnabled={form.returnInvoiceMailNotificationEnabled}
            smsEnabled={form.returnInvoiceSmsNotificationEnabled}
            mailUserIds={form.returnInvoiceMailNotificationUserIds}
            smsUserIds={form.returnInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => setValue('returnInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => setValue('returnInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => setValue('returnInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => setValue('returnInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Purchase Invoice"
            users={users}
            mailEnabled={form.purchaseInvoiceMailNotificationEnabled}
            smsEnabled={form.purchaseInvoiceSmsNotificationEnabled}
            mailUserIds={form.purchaseInvoiceMailNotificationUserIds}
            smsUserIds={form.purchaseInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => setValue('purchaseInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => setValue('purchaseInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => setValue('purchaseInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => setValue('purchaseInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Payments"
            users={users}
            mailEnabled={form.paymentMailNotificationEnabled}
            smsEnabled={form.paymentSmsNotificationEnabled}
            mailUserIds={form.paymentMailNotificationUserIds}
            smsUserIds={form.paymentSmsNotificationUserIds}
            onMailEnabled={(value) => setValue('paymentMailNotificationEnabled', value)}
            onSmsEnabled={(value) => setValue('paymentSmsNotificationEnabled', value)}
            onMailUsers={(ids) => setValue('paymentMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => setValue('paymentSmsNotificationUserIds', ids)}
          />
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name">
            <Input value={form.companyName} onChange={(event) => setValue('companyName', event.target.value)} />
          </Field>
          <Field label="Company email">
            <Input type="email" value={form.companyEmail} onChange={(event) => setValue('companyEmail', event.target.value)} />
          </Field>
          <Field label="Company phone">
            <Input value={form.companyPhone} onChange={(event) => setValue('companyPhone', event.target.value)} />
          </Field>
          <Field label="Company address">
            <Input value={form.companyAddress} onChange={(event) => setValue('companyAddress', event.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={!canSave || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function toForm(setting: GeneralSetting): FormState {
  return {
    siteTitle: setting.site_title,
    siteLogo: null,
    siteLogoUrl: setting.site_logo ?? '',
    removeSiteLogo: false,
    favicon: null,
    faviconUrl: setting.favicon ?? '',
    removeFavicon: false,
    companyName: setting.company_name ?? '',
    companyAddress: setting.company_address ?? '',
    companyEmail: setting.company_email ?? '',
    companyPhone: setting.company_phone ?? '',
    bulksmsbdApiUrl: setting.bulksmsbd_api_url ?? 'http://bulksmsbd.net/api/smsapi',
    bulksmsbdApiKey: setting.bulksmsbd_api_key ?? '',
    bulksmsbdSenderId: setting.bulksmsbd_sender_id ?? '',
    salesInvoiceApproverIds: setting.sales_invoice_approver_ids ?? [],
    returnInvoiceApproverIds: setting.return_invoice_approver_ids ?? [],
    purchaseInvoiceApproverIds: setting.purchase_invoice_approver_ids ?? [],
    paymentApproverIds: setting.payment_approver_ids ?? [],
    salesInvoiceMailNotificationEnabled: Boolean(setting.sales_invoice_mail_notification_enabled),
    salesInvoiceMailNotificationUserIds: setting.sales_invoice_mail_notification_user_ids ?? [],
    salesInvoiceSmsNotificationEnabled: Boolean(setting.sales_invoice_sms_notification_enabled),
    salesInvoiceSmsNotificationUserIds: setting.sales_invoice_sms_notification_user_ids ?? [],
    returnInvoiceMailNotificationEnabled: Boolean(setting.return_invoice_mail_notification_enabled),
    returnInvoiceMailNotificationUserIds: setting.return_invoice_mail_notification_user_ids ?? [],
    returnInvoiceSmsNotificationEnabled: Boolean(setting.return_invoice_sms_notification_enabled),
    returnInvoiceSmsNotificationUserIds: setting.return_invoice_sms_notification_user_ids ?? [],
    purchaseInvoiceMailNotificationEnabled: Boolean(setting.purchase_invoice_mail_notification_enabled),
    purchaseInvoiceMailNotificationUserIds: setting.purchase_invoice_mail_notification_user_ids ?? [],
    purchaseInvoiceSmsNotificationEnabled: Boolean(setting.purchase_invoice_sms_notification_enabled),
    purchaseInvoiceSmsNotificationUserIds: setting.purchase_invoice_sms_notification_user_ids ?? [],
    paymentMailNotificationEnabled: Boolean(setting.payment_mail_notification_enabled),
    paymentMailNotificationUserIds: setting.payment_mail_notification_user_ids ?? [],
    paymentSmsNotificationEnabled: Boolean(setting.payment_sms_notification_enabled),
    paymentSmsNotificationUserIds: setting.payment_sms_notification_user_ids ?? [],
    customerSalesInvoiceSmsNotificationEnabled: Boolean(setting.customer_sales_invoice_sms_notification_enabled),
    customerSalesInvoiceMailNotificationEnabled: Boolean(setting.customer_sales_invoice_mail_notification_enabled),
    customerReturnInvoiceSmsNotificationEnabled: Boolean(setting.customer_return_invoice_sms_notification_enabled),
    customerReturnInvoiceMailNotificationEnabled: Boolean(setting.customer_return_invoice_mail_notification_enabled),
  };
}

function payload(form: FormState): GeneralSettingPayload {
  return {
    site_title: form.siteTitle.trim(),
    site_logo: form.siteLogo,
    favicon: form.favicon,
    remove_site_logo: form.removeSiteLogo,
    remove_favicon: form.removeFavicon,
    company_name: nullableText(form.companyName),
    company_address: nullableText(form.companyAddress),
    company_email: nullableText(form.companyEmail),
    company_phone: nullableText(form.companyPhone),
    bulksmsbd_api_url: nullableText(form.bulksmsbdApiUrl),
    bulksmsbd_api_key: nullableText(form.bulksmsbdApiKey),
    bulksmsbd_sender_id: nullableText(form.bulksmsbdSenderId),
    sales_invoice_approver_ids: form.salesInvoiceApproverIds,
    return_invoice_approver_ids: form.returnInvoiceApproverIds,
    purchase_invoice_approver_ids: form.purchaseInvoiceApproverIds,
    payment_approver_ids: form.paymentApproverIds,
    sales_invoice_mail_notification_enabled: form.salesInvoiceMailNotificationEnabled,
    sales_invoice_mail_notification_user_ids: form.salesInvoiceMailNotificationUserIds,
    sales_invoice_sms_notification_enabled: form.salesInvoiceSmsNotificationEnabled,
    sales_invoice_sms_notification_user_ids: form.salesInvoiceSmsNotificationUserIds,
    return_invoice_mail_notification_enabled: form.returnInvoiceMailNotificationEnabled,
    return_invoice_mail_notification_user_ids: form.returnInvoiceMailNotificationUserIds,
    return_invoice_sms_notification_enabled: form.returnInvoiceSmsNotificationEnabled,
    return_invoice_sms_notification_user_ids: form.returnInvoiceSmsNotificationUserIds,
    purchase_invoice_mail_notification_enabled: form.purchaseInvoiceMailNotificationEnabled,
    purchase_invoice_mail_notification_user_ids: form.purchaseInvoiceMailNotificationUserIds,
    purchase_invoice_sms_notification_enabled: form.purchaseInvoiceSmsNotificationEnabled,
    purchase_invoice_sms_notification_user_ids: form.purchaseInvoiceSmsNotificationUserIds,
    payment_mail_notification_enabled: form.paymentMailNotificationEnabled,
    payment_mail_notification_user_ids: form.paymentMailNotificationUserIds,
    payment_sms_notification_enabled: form.paymentSmsNotificationEnabled,
    payment_sms_notification_user_ids: form.paymentSmsNotificationUserIds,
    customer_sales_invoice_sms_notification_enabled: form.customerSalesInvoiceSmsNotificationEnabled,
    customer_sales_invoice_mail_notification_enabled: form.customerSalesInvoiceMailNotificationEnabled,
    customer_return_invoice_sms_notification_enabled: form.customerReturnInvoiceSmsNotificationEnabled,
    customer_return_invoice_mail_notification_enabled: form.customerReturnInvoiceMailNotificationEnabled,
  };
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-900">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function NotificationGroup({
  title,
  users,
  mailEnabled,
  smsEnabled,
  mailUserIds,
  smsUserIds,
  onMailEnabled,
  onSmsEnabled,
  onMailUsers,
  onSmsUsers,
}: {
  title: string;
  users: User[];
  mailEnabled: boolean;
  smsEnabled: boolean;
  mailUserIds: number[];
  smsUserIds: number[];
  onMailEnabled: (value: boolean) => void;
  onSmsEnabled: (value: boolean) => void;
  onMailUsers: (ids: number[]) => void;
  onSmsUsers: (ids: number[]) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <NotificationChannel
          label={`Enable ${title} Mail Notification`}
          pickerLabel="Select User For Mail Notification"
          enabled={mailEnabled}
          users={users}
          selectedIds={mailUserIds}
          onEnabled={onMailEnabled}
          onUsers={onMailUsers}
        />
        <NotificationChannel
          label={`Enable ${title} SMS Notification`}
          pickerLabel="Select User For SMS Notification"
          enabled={smsEnabled}
          users={users}
          selectedIds={smsUserIds}
          onEnabled={onSmsEnabled}
          onUsers={onSmsUsers}
        />
      </div>
    </div>
  );
}

function NotificationChannel({
  label,
  pickerLabel,
  enabled,
  users,
  selectedIds,
  onEnabled,
  onUsers,
}: {
  label: string;
  pickerLabel: string;
  enabled: boolean;
  users: User[];
  selectedIds: number[];
  onEnabled: (value: boolean) => void;
  onUsers: (ids: number[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-900">
        <span>{label}</span>
        <Switch checked={enabled} onCheckedChange={onEnabled} />
      </label>
      {enabled ? <ApproverPicker label={pickerLabel} users={users} selectedIds={selectedIds} onChange={onUsers} /> : null}
    </div>
  );
}

function ApproverPicker({
  label,
  users,
  selectedIds,
  onChange,
}: {
  label: string;
  users: User[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = normalizedQuery
    ? users.filter((user) => `${user.name} ${user.email ?? ''}`.toLowerCase().includes(normalizedQuery))
    : users;

  function toggle(userId: number) {
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  }

  return (
    <div className="relative grid gap-2 rounded-md border border-neutral-200 p-3">
      <div className="text-sm font-medium text-neutral-900">{label}</div>
      <button
        type="button"
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left text-sm outline-none focus:border-black"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedUsers.length ? (
          selectedUsers.map((user) => (
            <span key={user.id} className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-800">
              {user.name}
              <span
                role="button"
                tabIndex={0}
                className="text-neutral-500 hover:text-neutral-900"
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(user.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    toggle(user.id);
                  }
                }}
              >
                x
              </span>
            </span>
          ))
        ) : (
          <span className="px-1 text-neutral-400">{users.length ? 'Select approvers' : 'No active users found'}</span>
        )}
      </button>
      {open ? (
        <div className="absolute left-3 right-3 top-[4.75rem] z-50 grid gap-2 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" autoFocus />
          <div className="grid max-h-56 overflow-y-auto">
            {filteredUsers.map((user) => {
              const selected = selectedIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`grid gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-neutral-100 ${selected ? 'bg-neutral-100' : ''}`}
                  onClick={() => toggle(user.id)}
                >
                  <span className="font-medium text-neutral-900">{user.name}</span>
                  {user.email ? <span className="text-xs text-neutral-500">{user.email}</span> : null}
                </button>
              );
            })}
            {!filteredUsers.length ? <div className="px-3 py-4 text-sm text-neutral-500">No users found.</div> : null}
          </div>
          <div className="flex justify-between gap-2 border-t border-neutral-100 pt-2">
            <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => onChange([])}>
              Clear
            </Button>
            <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImagePickerField({
  label,
  imageUrl,
  file,
  remove,
  onFile,
  onRemove,
}: {
  label: string;
  imageUrl: string;
  file: File | null;
  remove: boolean;
  onFile: (file: File | null) => void;
  onRemove: (remove: boolean) => void;
}) {
  const [filePreviewUrl, setFilePreviewUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setFilePreviewUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const previewUrl = filePreviewUrl || imageUrl;

  return (
    <div className="grid gap-2">
      <Field label={label}>
        <Input type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      </Field>
      {previewUrl && !remove ? <img src={previewUrl} alt="" className="h-20 w-20 rounded border border-neutral-200 object-cover" /> : null}
      {imageUrl ? (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={remove} onChange={(event) => onRemove(event.target.checked)} />
          Remove current {label.toLowerCase()}
        </label>
      ) : null}
    </div>
  );
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}
