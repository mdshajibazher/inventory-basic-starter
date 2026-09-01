'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { api, type CustomerPayload } from '@/lib/api';
import type { Customer, CustomerGroup, PaginationMeta, Role } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { ActionButton, Button, Checkbox, Field, Input, Modal, Select, StatusBadge, Switch, Textarea } from '@/components/ui';
import { EmptyState, PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';
import { sensitiveRoleAdditionMessage } from './sensitive-access-panel';

const defaultPerPage = 15;

type FormState = {
  customerGroupId: string;
  name: string;
  companyName: string;
  email: string;
  phoneNumber: string;
  taxNo: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isActive: boolean;
  createUser: boolean;
  username: string;
  password: string;
};

const emptyForm: FormState = {
  customerGroupId: '',
  name: '',
  companyName: '',
  email: '',
  phoneNumber: '',
  taxNo: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  isActive: true,
  createUser: false,
  username: '',
  password: '',
};

export function CustomersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [customerUserRole, setCustomerUserRole] = useState<Role | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const canAdd = hasPermission('customers-add');
  const canEdit = hasPermission('customers-edit');
  const canDelete = hasPermission('customers-delete');
  const canView = hasPermission('customers-index');

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: String(group.id), label: `${group.name} (${group.percentage}%)` })),
    [groups]
  );

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await api.customers({ page: nextPage, perPage, search: debouncedSearch });
      setCustomers(response.data as Customer[]);
      setPagination(response.meta ?? null);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, perPage]);

  useEffect(() => {
    if (!hasPermission('customers-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    void api.customerOptions()
      .then((response) => {
        const data = response.data as { customer_groups?: CustomerGroup[]; customer_user_role?: Role | null };
        setGroups(data.customer_groups ?? []);
        setCustomerUserRole(data.customer_user_role ?? null);
      })
      .catch((error) => toast.error('Options failed', { description: errorMessage(error) }));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  function setValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, customerGroupId: groups[0] ? String(groups[0].id) : '' });
    setOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm(customerToForm(customer));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const validation = validate(form, editing);
    if (validation) {
      toast.error(validation.title, { description: validation.description });
      return;
    }

    const requestPayload = payload(form);
    const createsLinkedUser = form.createUser && !editing?.user_id;
    if (createsLinkedUser && customerUserRole?.sensitive_permissions?.length) {
      if (!window.confirm(sensitiveRoleAdditionMessage([customerUserRole]))) return;
      requestPayload.acknowledged = true;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.updateCustomer(editing.id, requestPayload);
      } else {
        await api.createCustomer(requestPayload);
      }
      closeModal();
      toast.success(`Customer ${editing ? 'updated' : 'created'}`);
      if (editing || page === 1) await load(editing ? page : 1);
      else setPage(1);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    setSaving(true);
    try {
      await api.deleteCustomer(customer.id);
      toast.success('Customer deleted');
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} shown from ${pagination?.total ?? customers.length}`} canAdd={canAdd} onAdd={openCreate} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search customers, contact, location, group" />
      {customers.length ? (
        <TableWrap loading={loading}>
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                {['Customer', 'Group', 'Phone', 'Email', 'City', 'User', 'Status', 'Action'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium">{customer.name}</td>
                  <td className="px-4 py-3">{customer.customer_group?.name ?? '-'}</td>
                  <td className="px-4 py-3">{customer.phone_number}</td>
                  <td className="px-4 py-3">{customer.email || '-'}</td>
                  <td className="px-4 py-3">{customer.city}</td>
                  <td className="px-4 py-3">{customer.user ? customer.user.name : '-'}</td>
                  <td className="px-4 py-3"><StatusBadge active={customer.is_active} /></td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canView ? (
                        <ActionButton
                          icon={FileText}
                          text="View statement"
                          color="text-blue-600 hover:text-blue-700"
                          bgColor="bg-blue-50 hover:border-blue-100 hover:bg-blue-100"
                          href={`/customers/${customer.id}/statement`}
                        />
                      ) : null}
                      {canEdit ? (
                        <ActionButton
                          icon={Pencil}
                          text="Edit customer"
                          color="text-amber-600 hover:text-amber-700"
                          bgColor="bg-amber-50 hover:border-amber-100 hover:bg-amber-100"
                          onClick={() => openEdit(customer)}
                        />
                      ) : null}
                      {canDelete ? (
                        <ActionButton
                          icon={Trash2}
                          text="Delete customer"
                          color="text-red-500 hover:text-red-600"
                          bgColor="bg-red-50 hover:border-red-100 hover:bg-red-100"
                          disabled={saving}
                          onClick={() => void remove(customer)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <EmptyState label={loading ? 'Loading...' : 'No customers found.'} />
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} onPerPageChange={(nextPerPage) => { setPerPage(nextPerPage); setPage(1); }} />

      <Modal title={`${editing ? 'Edit' : 'Add'} Customer`} open={open} onOpenChange={setOpen}>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer group"><Select value={form.customerGroupId} onValueChange={(value) => setValue('customerGroupId', value)} options={groupOptions} /></Field>
            <Field label="Customer name"><Input value={form.name} onChange={(event) => setValue('name', event.target.value)} /></Field>
            <Field label="Company name"><Input value={form.companyName} onChange={(event) => setValue('companyName', event.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setValue('email', event.target.value)} /></Field>
            <Field label="Phone number"><Input value={form.phoneNumber} onChange={(event) => setValue('phoneNumber', event.target.value)} /></Field>
            <Field label="Tax no"><Input value={form.taxNo} onChange={(event) => setValue('taxNo', event.target.value)} /></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => setValue('city', event.target.value)} /></Field>
            <Field label="State"><Input value={form.state} onChange={(event) => setValue('state', event.target.value)} /></Field>
            <Field label="Postal code"><Input value={form.postalCode} onChange={(event) => setValue('postalCode', event.target.value)} /></Field>
            <Field label="Country"><Input value={form.country} onChange={(event) => setValue('country', event.target.value)} /></Field>
          </div>
          <Field label="Address"><Textarea value={form.address} onChange={(event) => setValue('address', event.target.value)} /></Field>
          <label className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm">
            <Checkbox checked={form.createUser} onCheckedChange={(checked) => setValue('createUser', checked)} />
            Create User
          </label>
          {form.createUser ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username"><Input value={form.username} onChange={(event) => setValue('username', event.target.value)} /></Field>
              <Field label="Password"><Input type="password" value={form.password} onChange={(event) => setValue('password', event.target.value)} /></Field>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={form.isActive} onCheckedChange={(checked) => setValue('isActive', checked)} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function customerToForm(customer: Customer): FormState {
  return {
    customerGroupId: String(customer.customer_group_id),
    name: customer.name,
    companyName: customer.company_name ?? '',
    email: customer.email ?? '',
    phoneNumber: customer.phone_number,
    taxNo: customer.tax_no ?? '',
    address: customer.address,
    city: customer.city,
    state: customer.state ?? '',
    postalCode: customer.postal_code ?? '',
    country: customer.country ?? '',
    isActive: Boolean(customer.is_active),
    createUser: false,
    username: '',
    password: '',
  };
}

function validate(form: FormState, editing: Customer | null) {
  if (!form.customerGroupId) return { title: 'Missing group', description: 'Customer group is required.' };
  if (!form.name.trim()) return { title: 'Missing name', description: 'Customer name is required.' };
  if (!form.phoneNumber.trim()) return { title: 'Missing phone', description: 'Phone number is required.' };
  if (!form.address.trim()) return { title: 'Missing address', description: 'Address is required.' };
  if (!form.city.trim()) return { title: 'Missing city', description: 'City is required.' };
  if (form.createUser && !editing?.user_id) {
    if (!form.email.trim()) return { title: 'Missing email', description: 'Email is required to create a linked user.' };
    if (!form.username.trim()) return { title: 'Missing username', description: 'Username is required to create a linked user.' };
    if (form.password.length < 6) return { title: 'Invalid password', description: 'Password must be at least 6 characters.' };
  }
  return null;
}

function payload(form: FormState): CustomerPayload {
  return {
    customer_group_id: Number(form.customerGroupId),
    name: form.name.trim(),
    company_name: nullableText(form.companyName),
    email: nullableText(form.email),
    phone_number: form.phoneNumber.trim(),
    tax_no: nullableText(form.taxNo),
    address: form.address.trim(),
    city: form.city.trim(),
    state: nullableText(form.state),
    postal_code: nullableText(form.postalCode),
    country: nullableText(form.country),
    is_active: form.isActive,
    create_user: form.createUser,
    username: nullableText(form.username),
    password: nullableText(form.password),
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}
