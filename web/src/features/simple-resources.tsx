'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Account, Brand, Branch, Category, Currency, PaginationMeta, Supplier, Tax, Unit, UnitGroup, Warehouse } from '@/lib/types';
import { errorMessage, toNumber } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Modal, Select, StatusBadge, Switch } from '@/components/ui';
import { EmptyState, PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';

const perPage = 15;

type Resource = 'brands' | 'branches' | 'suppliers' | 'categories' | 'units' | 'taxes' | 'currencies' | 'warehouses' | 'accounts';

type ResourceMap = {
  brands: Brand;
  branches: Branch;
  suppliers: Supplier;
  categories: Category;
  units: Unit;
  taxes: Tax;
  currencies: Currency;
  warehouses: Warehouse;
  accounts: Account;
};

const meta: Record<Resource, { title: string; search: string; permission: string }> = {
  brands: { title: 'Brands', search: 'Search brands, image, status', permission: 'brands' },
  branches: { title: 'Branches', search: 'Search branches, company, contact, address, status', permission: 'branches' },
  suppliers: { title: 'Suppliers', search: 'Search suppliers, company, contact, address, status', permission: 'suppliers' },
  categories: { title: 'Categories', search: 'Search categories, parent, status', permission: 'categories' },
  units: { title: 'Units', search: 'Search units, base, operator, status', permission: 'units' },
  taxes: { title: 'Taxes', search: 'Search taxes, rates, status', permission: 'taxes' },
  currencies: { title: 'Currencies', search: 'Search currencies, codes, exchange rates', permission: 'currencies' },
  warehouses: { title: 'Warehouses', search: 'Search warehouses, contact, address, status', permission: 'warehouses' },
  accounts: { title: 'Accounts', search: 'Search accounts, numbers, notes, status', permission: 'accounts' },
};

type FormState = Record<string, string | boolean | number | null | File>;

export function SimpleResourcePage<T extends Resource>({ resource }: { resource: T }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const resourceMeta = meta[resource];
  const [items, setItems] = useState<ResourceMap[T][]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceMap[T] | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(resource));
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);

  const canAdd = hasPermission(`${resourceMeta.permission}-add`);
  const canEdit = resource === 'units' ? false : hasPermission(`${resourceMeta.permission}-edit`);
  const canDelete = hasPermission(`${resourceMeta.permission}-delete`);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api[resource]({ page: nextPage, perPage, search: debouncedSearch });
      setItems(response.data as ResourceMap[T][]);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, resource]);

  useEffect(() => {
    if (!hasPermission(`${resourceMeta.permission}-index`)) router.replace('/dashboard');
  }, [hasPermission, resourceMeta.permission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (resource !== 'units') return;

    api.unitGroups()
      .then((response) => setUnitGroups(response.data as UnitGroup[]))
      .catch((error) => toast.error('Unit groups failed', { description: errorMessage(error) }));
  }, [resource]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const optionUnits = useMemo(() => (resource === 'units' ? (items as Unit[]) : []), [items, resource]);
  const optionCategories = useMemo(() => (resource === 'categories' ? (items as Category[]) : []), [items, resource]);

  function setValue(key: string, value: string | boolean | number | null | File) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(resource));
    setOpen(true);
  }

  function openEdit(item: ResourceMap[T]) {
    setEditing(item);
    setForm(toForm(resource, item));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm(resource));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const validation = validate(resource, form);
    if (validation) {
      toast.error(validation.title, { description: validation.description });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateResource(resource, editing.id, form);
      } else {
        await createResource(resource, form);
      }
      closeModal();
      toast.success(`${singular(resourceMeta.title)} saved`);
      if (editing || page === 1) await load(editing ? page : 1);
      else setPage(1);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ResourceMap[T]) {
    if (!window.confirm(`Delete ${itemLabel(resource, item)}?`)) return;
    setSaving(true);
    try {
      await deleteResource(resource, item.id);
      toast.success(`${singular(resourceMeta.title)} deleted`);
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={resourceMeta.title}
        subtitle={`${items.length} shown from ${pagination?.total ?? items.length}`}
        canAdd={canAdd}
        onAdd={openCreate}
      />
      <SearchBox value={search} onChange={setSearch} placeholder={resourceMeta.search} />
      {resource === 'units' ? (
        <p className="mb-3 text-sm text-amber-700">Units cannot be edited after creation. Units already used in invoices cannot be deleted.</p>
      ) : null}
      {items.length ? (
        <TableWrap>
          {renderTable(resource, items, { canEdit, canDelete, openEdit, remove, saving })}
        </TableWrap>
      ) : (
        <EmptyState label={loading ? 'Loading...' : `No ${resourceMeta.title.toLowerCase()} found.`} />
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} />
      <Modal title={`${editing ? 'Edit' : 'Add'} ${singular(resourceMeta.title)}`} open={open} onOpenChange={setOpen}>
        <form onSubmit={save} className="grid gap-4">
          {renderFields(resource, form, setValue, { units: optionUnits, categories: optionCategories, unitGroups, editingId: editing?.id })}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function emptyForm(resource: Resource): FormState {
  switch (resource) {
    case 'brands':
      return { title: '', image: null, removeImage: false, isActive: true };
    case 'branches':
    case 'suppliers':
      return {
        name: '',
        image: null,
        removeImage: false,
        companyName: '',
        vatNumber: '',
        email: '',
        phoneNumber: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
        isActive: true,
      };
    case 'categories':
      return { name: '', image: null, removeImage: false, parentId: null, isActive: true };
    case 'units':
      return { unitCode: '', unitName: '', unitGroupId: null, baseUnit: null, operator: '*', operationValue: '1', isActive: true };
    case 'taxes':
      return { name: '', rate: '', isActive: true };
    case 'currencies':
      return { name: '', code: '', exchangeRate: '' };
    case 'warehouses':
      return { name: '', phone: '', email: '', address: '', isActive: true };
    case 'accounts':
      return { accountNo: '', name: '', initialBalance: '0', totalBalance: '0', note: '', isDefault: false, isActive: true };
  }
}

function toForm(resource: Resource, item: Brand | Branch | Category | Unit | Tax | Currency | Warehouse | Account): FormState {
  switch (resource) {
    case 'brands': {
      const brand = item as Brand;
      return { title: brand.title, image: null, removeImage: false, isActive: Boolean(brand.is_active) };
    }
    case 'branches':
    case 'suppliers': {
      const branch = item as Branch;
      return {
        name: branch.name,
        image: null,
        removeImage: false,
        companyName: branch.company_name,
        vatNumber: branch.vat_number ?? '',
        email: branch.email,
        phoneNumber: branch.phone_number,
        address: branch.address,
        city: branch.city,
        state: branch.state ?? '',
        postalCode: branch.postal_code ?? '',
        country: branch.country ?? '',
        isActive: Boolean(branch.is_active),
      };
    }
    case 'categories': {
      const category = item as Category;
      return { name: category.name, image: null, removeImage: false, parentId: category.parent_id ?? null, isActive: Boolean(category.is_active) };
    }
    case 'units': {
      const unit = item as Unit;
      return {
        unitCode: unit.unit_code,
        unitName: unit.unit_name,
        unitGroupId: unit.unit_group_id ?? null,
        baseUnit: unit.base_unit ?? null,
        operator: unit.operator ?? '*',
        operationValue: unit.operation_value == null ? '' : String(unit.operation_value),
        isActive: Boolean(unit.is_active),
      };
    }
    case 'taxes': {
      const tax = item as Tax;
      return { name: tax.name, rate: String(tax.rate), isActive: Boolean(tax.is_active) };
    }
    case 'currencies': {
      const currency = item as Currency;
      return { name: currency.name, code: currency.code, exchangeRate: String(currency.exchange_rate) };
    }
    case 'warehouses': {
      const warehouse = item as Warehouse;
      return {
        name: warehouse.name,
        phone: warehouse.phone ?? '',
        email: warehouse.email ?? '',
        address: warehouse.address,
        isActive: Boolean(warehouse.is_active),
      };
    }
    case 'accounts': {
      const account = item as Account;
      return {
        accountNo: account.account_no,
        name: account.name,
        initialBalance: account.initial_balance == null ? '0' : String(account.initial_balance),
        totalBalance: account.total_balance == null ? '0' : String(account.total_balance),
        note: account.note ?? '',
        isDefault: Boolean(account.is_default),
        isActive: Boolean(account.is_active),
      };
    }
  }
}

function validate(resource: Resource, form: FormState) {
  if (resource === 'brands' && !String(form.title).trim()) return { title: 'Missing title', description: 'Brand title is required.' };
  if (resource === 'branches' || resource === 'suppliers') {
    const label = resource === 'branches' ? 'Branch' : 'Supplier';
    if (!String(form.name).trim()) return { title: 'Missing name', description: `${label} name is required.` };
    if (!String(form.companyName).trim()) return { title: 'Missing company', description: 'Company name is required.' };
    if (!String(form.email).trim()) return { title: 'Missing email', description: `${label} email is required.` };
    if (!String(form.phoneNumber).trim()) return { title: 'Missing phone', description: 'Phone number is required.' };
    if (!String(form.address).trim()) return { title: 'Missing address', description: `${label} address is required.` };
    if (!String(form.city).trim()) return { title: 'Missing city', description: `${label} city is required.` };
  }
  if (resource === 'categories' && !String(form.name).trim()) return { title: 'Missing name', description: 'Category name is required.' };
  if (resource === 'units') {
    if (!String(form.unitCode).trim() || !String(form.unitName).trim()) return { title: 'Missing fields', description: 'Unit code and unit name are required.' };
    if (!form.unitGroupId) return { title: 'Missing unit group', description: 'Unit group is required.' };
    if (form.baseUnit && (!form.operator || !String(form.operationValue).trim())) return { title: 'Missing conversion', description: 'Operator and operation value are required.' };
  }
  if (resource === 'taxes') {
    const rate = Number(form.rate);
    if (!String(form.name).trim()) return { title: 'Missing name', description: 'Tax name is required.' };
    if (!String(form.rate).trim() || Number.isNaN(rate) || rate < 0) return { title: 'Invalid rate', description: 'Enter a valid tax rate.' };
  }
  if (resource === 'currencies') {
    const exchangeRate = Number(form.exchangeRate);
    if (!String(form.name).trim() || !String(form.code).trim()) return { title: 'Missing fields', description: 'Currency name and code are required.' };
    if (!String(form.exchangeRate).trim() || Number.isNaN(exchangeRate) || exchangeRate < 0) return { title: 'Invalid rate', description: 'Enter a valid exchange rate.' };
  }
  if (resource === 'warehouses') {
    if (!String(form.name).trim()) return { title: 'Missing name', description: 'Warehouse name is required.' };
    if (!String(form.address).trim()) return { title: 'Missing address', description: 'Warehouse address is required.' };
  }
  if (resource === 'accounts') {
    const initialBalance = Number(form.initialBalance);
    const totalBalance = Number(form.totalBalance);
    if (!String(form.accountNo).trim()) return { title: 'Missing account number', description: 'Account number is required.' };
    if (!String(form.name).trim()) return { title: 'Missing name', description: 'Account name is required.' };
    if (Number.isNaN(initialBalance) || initialBalance < 0) return { title: 'Invalid initial balance', description: 'Enter a valid initial balance.' };
    if (Number.isNaN(totalBalance) || totalBalance < 0) return { title: 'Invalid total balance', description: 'Enter a valid total balance.' };
  }
  return null;
}

async function createResource(resource: Resource, form: FormState) {
  switch (resource) {
    case 'brands':
      return api.createBrand({ title: String(form.title).trim(), image: fileValue(form.image), remove_image: Boolean(form.removeImage), is_active: Boolean(form.isActive) });
    case 'branches':
      return api.createBranch(branchPayload(form));
    case 'suppliers':
      return api.createSupplier(branchPayload(form));
    case 'categories':
      return api.createCategory({ name: String(form.name).trim(), image: fileValue(form.image), remove_image: Boolean(form.removeImage), parent_id: numberOrNull(form.parentId), is_active: Boolean(form.isActive) });
    case 'units':
      return api.createUnit(unitPayload(form));
    case 'taxes':
      return api.createTax({ name: String(form.name).trim(), rate: toNumber(String(form.rate)), is_active: Boolean(form.isActive) });
    case 'currencies':
      return api.createCurrency({ name: String(form.name).trim(), code: String(form.code).trim().toUpperCase(), exchange_rate: toNumber(String(form.exchangeRate)) });
    case 'warehouses':
      return api.createWarehouse(warehousePayload(form));
    case 'accounts':
      return api.createAccount(accountPayload(form));
  }
}

async function updateResource(resource: Resource, id: number, form: FormState) {
  switch (resource) {
    case 'brands':
      return api.updateBrand(id, { title: String(form.title).trim(), image: fileValue(form.image), remove_image: Boolean(form.removeImage), is_active: Boolean(form.isActive) });
    case 'branches':
      return api.updateBranch(id, branchPayload(form));
    case 'suppliers':
      return api.updateSupplier(id, branchPayload(form));
    case 'categories':
      return api.updateCategory(id, { name: String(form.name).trim(), image: fileValue(form.image), remove_image: Boolean(form.removeImage), parent_id: numberOrNull(form.parentId), is_active: Boolean(form.isActive) });
    case 'units':
      return api.updateUnit(id, unitPayload(form));
    case 'taxes':
      return api.updateTax(id, { name: String(form.name).trim(), rate: toNumber(String(form.rate)), is_active: Boolean(form.isActive) });
    case 'currencies':
      return api.updateCurrency(id, { name: String(form.name).trim(), code: String(form.code).trim().toUpperCase(), exchange_rate: toNumber(String(form.exchangeRate)) });
    case 'warehouses':
      return api.updateWarehouse(id, warehousePayload(form));
    case 'accounts':
      return api.updateAccount(id, accountPayload(form));
  }
}

async function deleteResource(resource: Resource, id: number) {
  switch (resource) {
    case 'brands':
      return api.deleteBrand(id);
    case 'branches':
      return api.deleteBranch(id);
    case 'suppliers':
      return api.deleteSupplier(id);
    case 'categories':
      return api.deleteCategory(id);
    case 'units':
      return api.deleteUnit(id);
    case 'taxes':
      return api.deleteTax(id);
    case 'currencies':
      return api.deleteCurrency(id);
    case 'warehouses':
      return api.deleteWarehouse(id);
    case 'accounts':
      return api.deleteAccount(id);
  }
}

function unitPayload(form: FormState) {
  const hasBaseUnit = form.baseUnit !== null && form.baseUnit !== '';
  return {
    unit_code: String(form.unitCode).trim(),
    unit_name: String(form.unitName).trim(),
    unit_group_id: numberOrNull(form.unitGroupId),
    base_unit: numberOrNull(form.baseUnit),
    operator: hasBaseUnit ? String(form.operator || '*') : '*',
    operation_value: hasBaseUnit ? toNumber(String(form.operationValue), 1) : 1,
    is_active: Boolean(form.isActive),
  };
}

function warehousePayload(form: FormState) {
  return {
    name: String(form.name).trim(),
    phone: nullableText(form.phone),
    email: nullableText(form.email),
    address: String(form.address).trim(),
    is_active: Boolean(form.isActive),
  };
}

function accountPayload(form: FormState) {
  return {
    account_no: String(form.accountNo).trim(),
    name: String(form.name).trim(),
    initial_balance: toNumber(String(form.initialBalance), 0),
    total_balance: toNumber(String(form.totalBalance), 0),
    note: nullableText(form.note),
    is_default: Boolean(form.isDefault),
    is_active: Boolean(form.isActive),
  };
}

function branchPayload(form: FormState) {
  return {
    name: String(form.name).trim(),
    image: fileValue(form.image),
    remove_image: Boolean(form.removeImage),
    company_name: String(form.companyName).trim(),
    vat_number: nullableText(form.vatNumber),
    email: String(form.email).trim(),
    phone_number: String(form.phoneNumber).trim(),
    address: String(form.address).trim(),
    city: String(form.city).trim(),
    state: nullableText(form.state),
    postal_code: nullableText(form.postalCode),
    country: nullableText(form.country),
    is_active: Boolean(form.isActive),
  };
}

function renderFields(
  resource: Resource,
  form: FormState,
  setValue: (key: string, value: string | boolean | number | null | File) => void,
  options: { units: Unit[]; categories: Category[]; unitGroups: UnitGroup[]; editingId?: number }
) {
  if (resource === 'brands') {
    return (
      <>
        <Field label="Title"><Input value={String(form.title)} onChange={(event) => setValue('title', event.target.value)} /></Field>
        <ImageFields form={form} setValue={setValue} />
        <ActiveField form={form} setValue={setValue} />
      </>
    );
  }
  if (resource === 'categories') {
    const categoryOptions = [{ value: 'none', label: 'No parent category' }, ...options.categories.filter((category) => category.id !== options.editingId).map((category) => ({ value: String(category.id), label: category.name }))];
    return (
      <>
        <Field label="Name"><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
        <Field label="Parent category"><Select value={form.parentId ? String(form.parentId) : 'none'} onValueChange={(value) => setValue('parentId', value === 'none' ? null : Number(value))} options={categoryOptions} /></Field>
        <ImageFields form={form} setValue={setValue} />
        <ActiveField form={form} setValue={setValue} />
      </>
    );
  }
  if (resource === 'branches' || resource === 'suppliers') {
    const label = resource === 'branches' ? 'Branch' : 'Supplier';
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`${label} name`}><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
          <Field label="Company name"><Input value={String(form.companyName)} onChange={(event) => setValue('companyName', event.target.value)} /></Field>
          <Field label="VAT number"><Input value={String(form.vatNumber)} onChange={(event) => setValue('vatNumber', event.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={String(form.email)} onChange={(event) => setValue('email', event.target.value)} /></Field>
          <Field label="Phone number"><Input value={String(form.phoneNumber)} onChange={(event) => setValue('phoneNumber', event.target.value)} /></Field>
          <Field label="City"><Input value={String(form.city)} onChange={(event) => setValue('city', event.target.value)} /></Field>
          <Field label="Address"><Input value={String(form.address)} onChange={(event) => setValue('address', event.target.value)} /></Field>
          <Field label="State"><Input value={String(form.state)} onChange={(event) => setValue('state', event.target.value)} /></Field>
          <Field label="Postal code"><Input value={String(form.postalCode)} onChange={(event) => setValue('postalCode', event.target.value)} /></Field>
          <Field label="Country"><Input value={String(form.country)} onChange={(event) => setValue('country', event.target.value)} /></Field>
        </div>
        <ImageFields form={form} setValue={setValue} />
        <ActiveField form={form} setValue={setValue} />
      </>
    );
  }
  if (resource === 'units') {
    const unitOptions = [{ value: 'none', label: 'No base unit' }, ...options.units.filter((unit) => unit.id !== options.editingId).map((unit) => ({ value: String(unit.id), label: unit.unit_name }))];
    const groupOptions = [{ value: 'none', label: 'Select unit group' }, ...options.unitGroups.map((group) => ({ value: String(group.id), label: group.title }))];
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit code"><Input value={String(form.unitCode)} onChange={(event) => setValue('unitCode', event.target.value)} /></Field>
          <Field label="Unit name"><Input value={String(form.unitName)} onChange={(event) => setValue('unitName', event.target.value)} /></Field>
        </div>
        <Field label="Unit group"><Select value={form.unitGroupId ? String(form.unitGroupId) : 'none'} onValueChange={(value) => setValue('unitGroupId', value === 'none' ? null : Number(value))} options={groupOptions} /></Field>
        <Field label="Base unit"><Select value={form.baseUnit ? String(form.baseUnit) : 'none'} onValueChange={(value) => setValue('baseUnit', value === 'none' ? null : Number(value))} options={unitOptions} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Operator"><Select value={String(form.operator || '*')} onValueChange={(value) => setValue('operator', value)} options={[{ value: '*', label: '*' }, { value: '/', label: '/' }]} /></Field>
          <Field label="Operation value"><Input type="number" step="0.0001" value={String(form.operationValue)} onChange={(event) => setValue('operationValue', event.target.value)} /></Field>
        </div>
        <ActiveField form={form} setValue={setValue} />
      </>
    );
  }
  if (resource === 'taxes') {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tax name"><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
          <Field label="Rate"><Input type="number" step="0.01" value={String(form.rate)} onChange={(event) => setValue('rate', event.target.value)} /></Field>
        </div>
        <ActiveField form={form} setValue={setValue} />
      </>
    );
  }
  if (resource === 'currencies') {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Currency name"><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
        <Field label="Code"><Input value={String(form.code)} onChange={(event) => setValue('code', event.target.value)} /></Field>
        <Field label="Exchange rate"><Input type="number" step="0.0001" value={String(form.exchangeRate)} onChange={(event) => setValue('exchangeRate', event.target.value)} /></Field>
      </div>
    );
  }
  if (resource === 'accounts') {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account number"><Input value={String(form.accountNo)} onChange={(event) => setValue('accountNo', event.target.value)} /></Field>
          <Field label="Account name"><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
          <Field label="Initial balance"><Input type="number" step="0.01" value={String(form.initialBalance)} onChange={(event) => setValue('initialBalance', event.target.value)} /></Field>
          <Field label="Total balance"><Input type="number" step="0.01" value={String(form.totalBalance)} onChange={(event) => setValue('totalBalance', event.target.value)} /></Field>
        </div>
        <Field label="Note"><Input value={String(form.note)} onChange={(event) => setValue('note', event.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <DefaultField form={form} setValue={setValue} />
          <ActiveField form={form} setValue={setValue} />
        </div>
      </>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Warehouse name"><Input value={String(form.name)} onChange={(event) => setValue('name', event.target.value)} /></Field>
      <Field label="Phone"><Input value={String(form.phone)} onChange={(event) => setValue('phone', event.target.value)} /></Field>
      <Field label="Email"><Input type="email" value={String(form.email)} onChange={(event) => setValue('email', event.target.value)} /></Field>
      <Field label="Address"><Input value={String(form.address)} onChange={(event) => setValue('address', event.target.value)} /></Field>
      <ActiveField form={form} setValue={setValue} />
    </div>
  );
}

function ImageFields({ form, setValue }: { form: FormState; setValue: (key: string, value: string | boolean | number | null | File) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Image"><Input type="file" accept="image/*" onChange={(event) => setValue('image', event.target.files?.[0] ?? null)} /></Field>
      <label className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm">
        <input type="checkbox" checked={Boolean(form.removeImage)} onChange={(event) => setValue('removeImage', event.target.checked)} />
        Remove current image
      </label>
    </div>
  );
}

function ActiveField({ form, setValue }: { form: FormState; setValue: (key: string, value: string | boolean | number | null | File) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
      <span className="text-sm font-medium">Active</span>
      <Switch checked={Boolean(form.isActive)} onCheckedChange={(checked) => setValue('isActive', checked)} />
    </div>
  );
}

function DefaultField({ form, setValue }: { form: FormState; setValue: (key: string, value: string | boolean | number | null | File) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
      <span className="text-sm font-medium">Default</span>
      <Switch checked={Boolean(form.isDefault)} onCheckedChange={(checked) => setValue('isDefault', checked)} />
    </div>
  );
}

function renderTable<T extends Brand | Branch | Category | Unit | Tax | Currency | Warehouse | Account>(
  resource: Resource,
  items: T[],
  actions: { canEdit: boolean; canDelete: boolean; openEdit: (item: T) => void; remove: (item: T) => void; saving: boolean }
) {
  const actionCells = (item: T) => (
    <td className="whitespace-nowrap px-4 py-3 text-right">
      {actions.canEdit ? <Button variant="ghost" onClick={() => actions.openEdit(item)}>Edit</Button> : null}
      {actions.canDelete ? <Button variant="danger" disabled={actions.saving} onClick={() => void actions.remove(item)}>Delete</Button> : null}
    </td>
  );

  if (resource === 'brands') {
    return <Table headers={['Brand', 'Image', 'Status', 'Action']}>{(items as Brand[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.title}</td><td className="px-4 py-3">{item.image ? <img src={item.image} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-neutral-400">No image</span>}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
  }
  if (resource === 'branches' || resource === 'suppliers') {
    const firstHeader = resource === 'branches' ? 'Branch' : 'Supplier';
    return <Table headers={[firstHeader, 'Image', 'Company', 'Email', 'Phone', 'City', 'Status', 'Action']}>{(items as Array<Branch | Supplier>).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.image ? <img src={item.image} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-neutral-400">No image</span>}</td><td className="px-4 py-3">{item.company_name}</td><td className="px-4 py-3">{item.email}</td><td className="px-4 py-3">{item.phone_number}</td><td className="px-4 py-3">{item.city}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
  }
  if (resource === 'categories') {
    return <Table headers={['Category', 'Image', 'Parent', 'Status', 'Action']}>{(items as Category[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.image ? <img src={item.image} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-neutral-400">No image</span>}</td><td className="px-4 py-3">{item.parent_category_name ?? item.parent?.name ?? '-'}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
  }
  if (resource === 'units') {
    return <Table headers={['Code', 'Unit', 'Group', 'Base', 'Operator', 'Value', 'Status', 'Action']}>{(items as Unit[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3">{item.unit_code}</td><td className="px-4 py-3 font-medium">{item.unit_name}</td><td className="px-4 py-3">{item.unit_group_title ?? item.unit_group?.title ?? '-'}</td><td className="px-4 py-3">{item.base_unit_name ?? item.base?.unit_name ?? 'Base unit'}</td><td className="px-4 py-3">{item.operator ?? '-'}</td><td className="px-4 py-3">{item.operation_value ?? '-'}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td><td className="whitespace-nowrap px-4 py-3 text-right">{actions.canDelete && item.can_delete !== false ? <Button variant="danger" disabled={actions.saving} onClick={() => void actions.remove(item as T)}>Delete</Button> : <span className="text-xs text-neutral-500">{item.can_delete === false ? 'In use' : '-'}</span>}</td></tr>)}</Table>;
  }
  if (resource === 'taxes') {
    return <Table headers={['Tax', 'Rate', 'Status', 'Action']}>{(items as Tax[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.rate}%</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
  }
  if (resource === 'currencies') {
    return <Table headers={['Currency', 'Code', 'Exchange Rate', 'Action']}>{(items as Currency[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.code}</td><td className="px-4 py-3">{item.exchange_rate}</td>{actionCells(item as T)}</tr>)}</Table>;
  }
  if (resource === 'accounts') {
    return <Table headers={['Account', 'Number', 'Initial', 'Balance', 'Default', 'Status', 'Action']}>{(items as Account[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.account_no}</td><td className="px-4 py-3">{item.initial_balance ?? 0}</td><td className="px-4 py-3">{item.total_balance}</td><td className="px-4 py-3">{item.is_default ? 'Default' : '-'}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
  }
  return <Table headers={['Warehouse', 'Phone', 'Email', 'Address', 'Status', 'Action']}>{(items as Warehouse[]).map((item) => <tr key={item.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.phone || '-'}</td><td className="px-4 py-3">{item.email || '-'}</td><td className="px-4 py-3">{item.address}</td><td className="px-4 py-3"><StatusBadge active={item.is_active} /></td>{actionCells(item as T)}</tr>)}</Table>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
        <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function fileValue(value: unknown) {
  return value instanceof File ? value : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function singular(title: string) {
  return title.endsWith('ies') ? `${title.slice(0, -3)}y` : title.replace(/s$/, '');
}

function itemLabel(resource: Resource, item: Brand | Branch | Supplier | Category | Unit | Tax | Currency | Warehouse | Account) {
  if (resource === 'brands') return (item as Brand).title;
  if (resource === 'branches') return (item as Branch).name;
  if (resource === 'suppliers') return (item as Supplier).name;
  if (resource === 'units') return (item as Unit).unit_name;
  if (resource === 'currencies') return (item as Currency).code;
  if (resource === 'warehouses') return (item as Warehouse).name;
  if (resource === 'accounts') return (item as Account).name;
  return (item as Category | Tax).name;
}
