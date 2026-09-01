import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Modal, Portal, Searchbar, Switch, Text, TextInput } from 'react-native-paper';
import { ImageUploadField, type PickedImage } from '@/src/components/ImageUploadField';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type GeneralSettingPayload } from '@/src/lib/api';
import type { GeneralSetting, User } from '@/src/types';

type FormState = {
  siteTitle: string;
  siteLogo: PickedImage | null;
  siteLogoUrl: string;
  removeSiteLogo: boolean;
  favicon: PickedImage | null;
  faviconUrl: string;
  removeFavicon: boolean;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  bulksmsbdApiUrl: string;
  bulksmsbdApiKey: string;
  bulksmsbdSenderId: string;
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

export default function GeneralSettingsScreen() {
  const { hasPermission } = useAuth();
  const [setting, setSetting] = useState<GeneralSetting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManageSettings = hasPermission('super-user');

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
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    if (!form.siteTitle.trim()) {
      Alert.alert('Missing site title', 'Site title is required.');
      return;
    }

    setSaving(true);
    try {
      if (setting) {
        await api.updateGeneralSetting(setting.id, payload(form));
      } else {
        await api.createGeneralSetting(payload(form));
      }

      await load();
      Alert.alert('Saved', 'General settings saved.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!canManageSettings) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">General Settings</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {loading ? 'Loading settings...' : 'Company and app information used by reports'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <TextInput mode="outlined" label="Site title" value={form.siteTitle} onChangeText={(value) => updateForm('siteTitle', value)} />
        <ImageUploadField
          label="Site logo"
          imageUri={form.removeSiteLogo ? null : form.siteLogo?.uri ?? form.siteLogoUrl}
          disabled={saving}
          onChange={(image) => {
            updateForm('siteLogo', image);
            updateForm('removeSiteLogo', false);
          }}
          onClear={() => {
            updateForm('siteLogo', null);
            updateForm('removeSiteLogo', Boolean(form.siteLogoUrl));
          }}
        />
        <ImageUploadField
          label="Favicon"
          imageUri={form.removeFavicon ? null : form.favicon?.uri ?? form.faviconUrl}
          disabled={saving}
          onChange={(image) => {
            updateForm('favicon', image);
            updateForm('removeFavicon', false);
          }}
          onClear={() => {
            updateForm('favicon', null);
            updateForm('removeFavicon', Boolean(form.faviconUrl));
          }}
        />
        <TextInput mode="outlined" label="Company name" value={form.companyName} onChangeText={(value) => updateForm('companyName', value)} />
        <TextInput mode="outlined" label="Company email" keyboardType="email-address" autoCapitalize="none" value={form.companyEmail} onChangeText={(value) => updateForm('companyEmail', value)} />
        <TextInput mode="outlined" label="Company phone" keyboardType="phone-pad" value={form.companyPhone} onChangeText={(value) => updateForm('companyPhone', value)} />
        <TextInput
          mode="outlined"
          label="Company address"
          multiline
          numberOfLines={3}
          value={form.companyAddress}
          onChangeText={(value) => updateForm('companyAddress', value)}
        />

        <View style={styles.approvals}>
          <Text variant="titleMedium">Notifications</Text>
          <View style={styles.notificationBox}>
            <Text variant="titleSmall">Bulk SMS BD</Text>
            <TextInput mode="outlined" label="API URL" autoCapitalize="none" value={form.bulksmsbdApiUrl} onChangeText={(value) => updateForm('bulksmsbdApiUrl', value)} />
            <TextInput mode="outlined" label="API Key" secureTextEntry autoCapitalize="none" value={form.bulksmsbdApiKey} onChangeText={(value) => updateForm('bulksmsbdApiKey', value)} />
            <TextInput mode="outlined" label="Sender ID" autoCapitalize="none" value={form.bulksmsbdSenderId} onChangeText={(value) => updateForm('bulksmsbdSenderId', value)} />
          </View>
          <View style={styles.notificationBox}>
            <Text variant="titleSmall">Customer Notifications</Text>
            <ToggleRow label="Enable Customer Sales Invoice SMS Notification" value={form.customerSalesInvoiceSmsNotificationEnabled} onValueChange={(value) => updateForm('customerSalesInvoiceSmsNotificationEnabled', value)} />
            <ToggleRow label="Email Approved Sales Invoices to Customers" value={form.customerSalesInvoiceMailNotificationEnabled} onValueChange={(value) => updateForm('customerSalesInvoiceMailNotificationEnabled', value)} />
            <ToggleRow label="Enable Customer Return Invoice SMS Notification" value={form.customerReturnInvoiceSmsNotificationEnabled} onValueChange={(value) => updateForm('customerReturnInvoiceSmsNotificationEnabled', value)} />
            <ToggleRow label="Enable Customer Return Invoice Email Notification" value={form.customerReturnInvoiceMailNotificationEnabled} onValueChange={(value) => updateForm('customerReturnInvoiceMailNotificationEnabled', value)} />
          </View>
          <NotificationGroup
            title="Sales Invoice"
            users={users}
            mailEnabled={form.salesInvoiceMailNotificationEnabled}
            smsEnabled={form.salesInvoiceSmsNotificationEnabled}
            mailUserIds={form.salesInvoiceMailNotificationUserIds}
            smsUserIds={form.salesInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => updateForm('salesInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => updateForm('salesInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => updateForm('salesInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => updateForm('salesInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Return Invoice"
            users={users}
            mailEnabled={form.returnInvoiceMailNotificationEnabled}
            smsEnabled={form.returnInvoiceSmsNotificationEnabled}
            mailUserIds={form.returnInvoiceMailNotificationUserIds}
            smsUserIds={form.returnInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => updateForm('returnInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => updateForm('returnInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => updateForm('returnInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => updateForm('returnInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Purchase Invoice"
            users={users}
            mailEnabled={form.purchaseInvoiceMailNotificationEnabled}
            smsEnabled={form.purchaseInvoiceSmsNotificationEnabled}
            mailUserIds={form.purchaseInvoiceMailNotificationUserIds}
            smsUserIds={form.purchaseInvoiceSmsNotificationUserIds}
            onMailEnabled={(value) => updateForm('purchaseInvoiceMailNotificationEnabled', value)}
            onSmsEnabled={(value) => updateForm('purchaseInvoiceSmsNotificationEnabled', value)}
            onMailUsers={(ids) => updateForm('purchaseInvoiceMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => updateForm('purchaseInvoiceSmsNotificationUserIds', ids)}
          />
          <NotificationGroup
            title="Payments"
            users={users}
            mailEnabled={form.paymentMailNotificationEnabled}
            smsEnabled={form.paymentSmsNotificationEnabled}
            mailUserIds={form.paymentMailNotificationUserIds}
            smsUserIds={form.paymentSmsNotificationUserIds}
            onMailEnabled={(value) => updateForm('paymentMailNotificationEnabled', value)}
            onSmsEnabled={(value) => updateForm('paymentSmsNotificationEnabled', value)}
            onMailUsers={(ids) => updateForm('paymentMailNotificationUserIds', ids)}
            onSmsUsers={(ids) => updateForm('paymentSmsNotificationUserIds', ids)}
          />
        </View>

        <View style={styles.actions}>
          <Button mode="contained" disabled={!canManageSettings || saving} loading={saving} onPress={saveSettings}>
            Save
          </Button>
        </View>
      </ScrollView>
    </Screen>
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

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
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
    <View style={styles.notificationBox}>
      <Text variant="titleSmall">{title}</Text>
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
    </View>
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
    <View style={styles.notificationChannel}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch value={enabled} onValueChange={onEnabled} />
      </View>
      {enabled ? <NotificationRecipientPicker label={pickerLabel} users={users} selectedIds={selectedIds} onChange={onUsers} /> : null}
    </View>
  );
}

function NotificationRecipientPicker({
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
  const filteredUsers = normalizedQuery ? users.filter((user) => `${user.name} ${user.email ?? ''}`.toLowerCase().includes(normalizedQuery)) : users;

  function toggle(userId: number) {
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  }

  return (
    <View style={styles.recipientBox}>
      <Text variant="labelLarge">{label}</Text>
      <Button mode="outlined" contentStyle={styles.multiSelectButton} onPress={() => setOpen(true)}>
        {selectedUsers.length ? `${selectedUsers.length} selected` : 'Select recipients'}
      </Button>
      <Text style={styles.muted}>
        {selectedUsers.length ? selectedUsers.map((user) => user.name).join(', ') : users.length ? 'No recipients selected' : 'No active users found.'}
      </Text>
      <Portal>
        <Modal visible={open} onDismiss={() => setOpen(false)} contentContainerStyle={styles.multiSelectModal}>
          <Text variant="titleMedium">{label}</Text>
          <Searchbar value={query} onChangeText={setQuery} placeholder="Search users" style={styles.searchbar} inputStyle={styles.searchbarInput} />
          <ScrollView contentContainerStyle={styles.multiSelectList}>
            {filteredUsers.map((user) => {
              const selected = selectedIds.includes(user.id);
              return (
                <Button
                  key={user.id}
                  mode={selected ? 'contained' : 'outlined'}
                  contentStyle={styles.multiSelectOption}
                  onPress={() => toggle(user.id)}
                >
                  {user.name}{user.email ? ` (${user.email})` : ''}
                </Button>
              );
            })}
            {!filteredUsers.length ? <Text style={styles.muted}>{users.length ? 'No users found.' : 'No active users found.'}</Text> : null}
          </ScrollView>
          <Button mode="contained" onPress={() => setOpen(false)}>
            Done
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  muted: {
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    gap: 12,
    paddingBottom: 32,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  approvals: {
    gap: 10,
    marginTop: 8,
  },
  recipientBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  notificationBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  notificationChannel: {
    gap: 8,
  },
  switchRow: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  switchLabel: {
    color: '#111827',
    flex: 1,
    fontWeight: '600',
  },
  multiSelectButton: {
    justifyContent: 'flex-start',
  },
  multiSelectModal: {
    maxHeight: '86%',
    margin: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 12,
  },
  multiSelectList: {
    gap: 8,
    paddingVertical: 8,
  },
  multiSelectOption: {
    justifyContent: 'flex-start',
  },
  searchbar: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  searchbarInput: {
    minHeight: 0,
    paddingVertical: 0,
  },
});
