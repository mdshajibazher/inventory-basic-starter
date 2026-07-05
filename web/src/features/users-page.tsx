'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Branch, PaginationMeta, Permission, Role, User } from '@/lib/types';
import { errorMessage, permissionLabel } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Checkbox, Field, Input, Modal, StatusBadge, Switch } from '@/components/ui';
import { EmptyState, PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';

type UserOptions = {
  roles: Role[];
  permissions: Permission[];
  branches: Branch[];
};

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  isActive: boolean;
  billerIds: number[];
};

const emptyForm: UserForm = { name: '', email: '', phone: '', password: '', isActive: true, billerIds: [] };
const perPage = 15;

export function UsersPage() {
  const router = useRouter();
  const { hasPermission, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [options, setOptions] = useState<UserOptions>({ roles: [], permissions: [], branches: [] });
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'user' | 'roles' | 'permissions' | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const canAdd = hasPermission('users-add');
  const canEdit = hasPermission('users-edit');
  const canDelete = hasPermission('users-delete');

  const groupedPermissions = useMemo(() => groupPermissions(options.permissions), [options.permissions]);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const [usersResponse, optionsResponse] = await Promise.all([
        api.users({ page: nextPage, perPage, search: debouncedSearch }),
        api.userOptions(),
      ]);
      setUsers(usersResponse.data as User[]);
      setPagination(usersResponse.meta ?? null);
      setOptions(optionsResponse.data as UserOptions);
    } catch (error) {
      toast.error('Load failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (!hasPermission('users-index')) router.replace('/dashboard');
  }, [hasPermission, router]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  function setValue<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, billerIds: options.branches[0] ? [options.branches[0].id] : [] });
    setModal('user');
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      password: '',
      isActive: Boolean(user.is_active),
      billerIds: user.biller_ids ?? user.billers?.map((branch) => branch.id) ?? [],
    });
    setModal('user');
  }

  function openRoles(user: User) {
    setEditing(user);
    setSelectedRoles(userRoles(user).map((role) => role.id));
    setModal('roles');
  }

  function openPermissions(user: User) {
    setEditing(user);
    setSelectedPermissions(user.direct_permissions?.map((permission) => permission.name) ?? []);
    setModal('permissions');
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setForm(emptyForm);
    setSelectedRoles([]);
    setSelectedPermissions([]);
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error('Missing fields', { description: 'Name, email, and phone are required.' });
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error('Missing password', { description: 'Password is required for new users.' });
      return;
    }
    if (!form.billerIds.length) {
      toast.error('Missing branch', { description: 'Select at least one branch.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password.trim() || undefined,
        is_active: form.isActive,
        biller_ids: form.billerIds,
      };
      if (editing) await api.updateUser(editing.id, payload);
      else await api.createUser(payload);
      closeModal();
      toast.success('User saved');
      await load(editing ? page : 1);
      if (!editing) setPage(1);
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function saveRoles() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateUserRoles(editing.id, { roles: selectedRoles });
      const currentUser = await refreshUser();
      closeModal();
      if (currentUser?.permissions?.includes('users-index')) await load(page);
      toast.success('Roles updated');
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateUserPermissions(editing.id, { permissions: selectedPermissions });
      const currentUser = await refreshUser();
      closeModal();
      if (currentUser?.permissions?.includes('users-index')) await load(page);
      toast.success('Permissions updated');
    } catch (error) {
      toast.error('Save failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(user: User) {
    if (!window.confirm(`Delete ${user.name}?`)) return;
    setSaving(true);
    try {
      await api.deleteUser(user.id);
      toast.success('User deleted');
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle={`${users.length} shown from ${pagination?.total ?? users.length}`} canAdd={canAdd} onAdd={openCreate} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search users, email, phone, roles, permissions" />
      {users.length ? (
        <TableWrap>
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>{['User', 'Phone', 'Branches', 'Roles', 'Direct Permissions', 'Status', 'Action'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3"><div className="font-medium">{user.name}</div><div className="text-xs text-neutral-500">{user.email}</div></td>
                  <td className="px-4 py-3">{user.phone ?? '-'}</td>
                  <td className="px-4 py-3">{user.billers?.map((branch) => branch.name).join(', ') || user.current_biller?.name || '-'}</td>
                  <td className="px-4 py-3">{userRoles(user).map((role) => role.name).join(', ') || '-'}</td>
                  <td className="px-4 py-3">{user.direct_permissions?.length ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge active={user.is_active} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canEdit ? <Button variant="ghost" onClick={() => openEdit(user)}>Edit</Button> : null}
                    {canEdit ? <Button variant="ghost" onClick={() => openRoles(user)}>Roles</Button> : null}
                    {canEdit ? <Button variant="ghost" onClick={() => openPermissions(user)}>Permissions</Button> : null}
                    {canDelete ? <Button variant="danger" disabled={saving} onClick={() => void remove(user)}>Delete</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <EmptyState label={loading ? 'Loading...' : 'No users found.'} />
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} />

      <Modal title={`${editing ? 'Edit' : 'Add'} User`} open={modal === 'user'} onOpenChange={(open) => !open && closeModal()}>
        <form onSubmit={saveUser} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(event) => setValue('name', event.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setValue('email', event.target.value)} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(event) => setValue('phone', event.target.value)} /></Field>
            <Field label="Password" hint={editing ? 'Leave blank to keep the current password.' : undefined}><Input type="password" value={form.password} onChange={(event) => setValue('password', event.target.value)} /></Field>
          </div>
          <BranchPicker
            branches={options.branches}
            selected={form.billerIds}
            onChange={(billerIds) => setValue('billerIds', billerIds)}
          />
          <div className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2"><span className="text-sm font-medium">Active</span><Switch checked={form.isActive} onCheckedChange={(checked) => setValue('isActive', checked)} /></div>
          <FormActions saving={saving} onCancel={closeModal} />
        </form>
      </Modal>

      <Modal title={`Update Roles${editing ? `: ${editing.name}` : ''}`} open={modal === 'roles'} onOpenChange={(open) => !open && closeModal()}>
        <div className="grid gap-3">
          {options.roles.map((role) => (
            <label key={role.id} className="flex items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm">
              <Checkbox checked={selectedRoles.includes(role.id)} onCheckedChange={() => setSelectedRoles((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} />
              <span>{role.name}</span>
            </label>
          ))}
          <FormActions saving={saving} onCancel={closeModal} onSave={() => void saveRoles()} />
        </div>
      </Modal>

      <Modal title={`Update Permissions${editing ? `: ${editing.name}` : ''}`} open={modal === 'permissions'} onOpenChange={(open) => !open && closeModal()}>
        <PermissionPicker grouped={groupedPermissions} selected={selectedPermissions} setSelected={setSelectedPermissions} />
        <FormActions saving={saving} onCancel={closeModal} onSave={() => void savePermissions()} />
      </Modal>
    </div>
  );
}

function BranchPicker({ branches, selected, onChange }: { branches: Branch[]; selected: number[]; onChange: (ids: number[]) => void }) {
  return (
    <section className="rounded-md border border-neutral-200">
      <div className="border-b border-neutral-100 p-3 text-sm font-medium">Branch</div>
      <div className="grid max-h-56 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
        {branches.map((branch) => (
          <label key={branch.id} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={selected.includes(branch.id)}
              onCheckedChange={() => onChange(selected.includes(branch.id) ? selected.filter((id) => id !== branch.id) : [...selected, branch.id])}
            />
            <span>{branch.company_name ? `${branch.name} - ${branch.company_name}` : branch.name}</span>
          </label>
        ))}
        {!branches.length ? <div className="text-sm text-neutral-500">No active branches found.</div> : null}
      </div>
    </section>
  );
}

export function PermissionPicker({
  grouped,
  selected,
  setSelected,
}: {
  grouped: Record<string, Permission[]>;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
      {Object.entries(grouped).map(([group, permissions]) => {
        const names = permissions.map((permission) => permission.name);
        const selectedCount = names.filter((name) => selected.includes(name)).length;
        const checked = selectedCount === names.length ? true : selectedCount > 0 ? 'indeterminate' : false;
        return (
          <section key={group} className="rounded-md border border-neutral-200">
            <div className="flex items-center gap-3 border-b border-neutral-100 p-3">
              <Checkbox
                checked={checked}
                onCheckedChange={() => setSelected((current) => names.every((name) => current.includes(name)) ? current.filter((name) => !names.includes(name)) : Array.from(new Set([...current, ...names])))}
              />
              <h3 className="text-sm font-semibold capitalize">{group}</h3>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {permissions.map((permission) => (
                <label key={permission.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={selected.includes(permission.name)}
                    onCheckedChange={() => setSelected((current) => current.includes(permission.name) ? current.filter((name) => name !== permission.name) : [...current, permission.name])}
                  />
                  {permissionLabel(permission.name)}
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FormActions({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave?: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type={onSave ? 'button' : 'submit'} disabled={saving} onClick={onSave}>{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  );
}

function userRoles(user: User): Role[] {
  return Array.isArray(user.roles) ? user.roles.filter((role): role is Role => typeof role === 'object') : [];
}

export function groupPermissions(permissions: Permission[]) {
  return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const group = permission.name.includes('-') ? permission.name.split('-')[0] : 'general';
    groups[group] = [...(groups[group] ?? []), permission];
    return groups;
  }, {});
}
