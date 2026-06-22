import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Text, TextInput } from 'react-native-paper';
import { ImageUploadField, type PickedImage } from '@/src/components/ImageUploadField';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api, type GeneralSettingPayload } from '@/src/lib/api';
import type { GeneralSetting } from '@/src/types';

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
};

export default function GeneralSettingsScreen() {
  const { hasPermission } = useAuth();
  const [setting, setSetting] = useState<GeneralSetting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canAdd = hasPermission('general-settings-add');
  const canEdit = hasPermission('general-settings-edit');
  const canDelete = hasPermission('general-settings-delete');
  const canSave = setting ? canEdit : canAdd;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.generalSettings({ page: 1, perPage: 1 });
      const nextSetting = (response.data[0] ?? null) as GeneralSetting | null;
      setSetting(nextSetting);
      setForm(nextSetting ? toForm(nextSetting) : emptyForm);
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

  function confirmDelete() {
    if (!setting) return;

    Alert.alert('Delete settings?', 'Delete general settings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSettings();
        },
      },
    ]);
  }

  async function deleteSettings() {
    if (!setting) return;

    setSaving(true);
    try {
      await api.deleteGeneralSetting(setting.id);
      setSetting(null);
      setForm(emptyForm);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('general-settings-index')) {
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

        <View style={styles.actions}>
          {setting && canDelete ? (
            <Button mode="outlined" textColor="#b91c1c" disabled={saving} onPress={confirmDelete}>
              Delete
            </Button>
          ) : null}
          <Button mode="contained" disabled={!canSave || saving} loading={saving} onPress={saveSettings}>
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
  };
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
});
