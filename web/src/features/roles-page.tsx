'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { PaginationMeta, Permission, Role } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button, Field, Input, Modal, StatusBadge, Switch, Textarea } from '@/components/ui';
import { EmptyState, PageHeader, Pagination, SearchBox, TableWrap } from '@/components/resource-shell';
import { groupPermissions, PermissionPicker } from './users-page';

type RoleForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const emptyForm: RoleForm = { name: '', description: '', isActive: true };
const perPage = 15;

export function RolesPage() {
  const router = useRouter();
  const { hasPermission, refreshUser } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'role' | 'permissions' | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const canAdd = hasPermission('users-add');
  const canEdit = hasPermission('users-edit');
  const canDelete = hasPermission('users-delete');
  const groupedPermissions = useMemo(() => groupPermissions(permissions), [permissions]);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        api.roles({ page: nextPage, perPage, search: debouncedSearch }),
        api.permissions(),
      ]);
      setRoles(rolesResponse.data as Role[]);
      setPagination(rolesResponse.meta ?? null);
      setPermissions(permissionsResponse.data as Permission[]);
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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModal('role');
  }

  function openEdit(role: Role) {
    setEditing(role);
    setForm({ name: role.name, description: role.description ?? '', isActive: Boolean(role.is_active) });
    setModal('role');
  }

  function openPermissions(role: Role) {
    setEditing(role);
    setSelectedPermissions(role.permissions?.map((permission) => permission.name) ?? []);
    setModal('permissions');
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setForm(emptyForm);
    setSelectedPermissions([]);
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Missing name', { description: 'Role name is required.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.isActive,
      };
      if (editing) await api.updateRole(editing.id, payload);
      else await api.createRole(payload);
      closeModal();
      toast.success('Role saved');
      await load(editing ? page : 1);
      if (!editing) setPage(1);
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
      await api.updateRole(editing.id, {
        name: editing.name,
        description: editing.description ?? null,
        is_active: Boolean(editing.is_active),
        permissions: selectedPermissions,
      });
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

  async function remove(role: Role) {
    if (!window.confirm(`Delete ${role.name}?`)) return;
    setSaving(true);
    try {
      await api.deleteRole(role.id);
      toast.success('Role deleted');
      await load(page);
    } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Roles" subtitle={`${roles.length} shown from ${pagination?.total ?? roles.length}`} canAdd={canAdd} onAdd={openCreate} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search roles, description, status" />
      {roles.length ? (
        <TableWrap>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>{['Role', 'Permissions', 'Status', 'Action'].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3"><div className="font-medium">{role.name}</div><div className="text-xs text-neutral-500">{role.description ?? '-'}</div></td>
                  <td className="px-4 py-3">{role.permissions?.length ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge active={role.is_active} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canEdit ? <Button variant="ghost" onClick={() => openEdit(role)}>Edit</Button> : null}
                    {canEdit ? <Button variant="ghost" onClick={() => openPermissions(role)}>Update Permission</Button> : null}
                    {canDelete ? <Button variant="danger" disabled={saving} onClick={() => void remove(role)}>Delete</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <EmptyState label={loading ? 'Loading...' : 'No roles found.'} />
      )}
      <Pagination meta={pagination} loading={loading} onPage={setPage} />

      <Modal title={`${editing ? 'Edit' : 'Add'} Role`} open={modal === 'role'} onOpenChange={(open) => !open && closeModal()}>
        <form onSubmit={saveRole} className="grid gap-4">
          <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
          <div className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
          </div>
          <Actions saving={saving} onCancel={closeModal} />
        </form>
      </Modal>

      <Modal title={`Update Permissions${editing ? `: ${editing.name}` : ''}`} open={modal === 'permissions'} onOpenChange={(open) => !open && closeModal()}>
        <PermissionPicker grouped={groupedPermissions} selected={selectedPermissions} setSelected={setSelectedPermissions} />
        <Actions saving={saving} onCancel={closeModal} onSave={() => void savePermissions()} />
      </Modal>
    </div>
  );
}

function Actions({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave?: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type={onSave ? 'button' : 'submit'} disabled={saving} onClick={onSave}>{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  );
}
