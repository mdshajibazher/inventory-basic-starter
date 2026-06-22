'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { PageHeader } from '@/components/resource-shell';
import { useAuth } from '@/context/auth-context';
import { api, type GeneralSettingPayload } from '@/lib/api';
import type { GeneralSetting } from '@/lib/types';
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

export function GeneralSettingsPage() {
  const router = useRouter();
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

  async function remove() {
    if (!setting || !window.confirm('Delete general settings?')) return;

    setSaving(true);
    try {
      await api.deleteGeneralSetting(setting.id);
      toast.success('General settings deleted');
      setSetting(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
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
          {setting && canDelete ? (
            <Button type="button" variant="danger" disabled={saving} onClick={() => void remove()}>
              Delete
            </Button>
          ) : null}
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
