import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Checkbox,
  DataTable,
  Modal,
  Portal,
  Searchbar,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { Redirect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { PaginationMeta, Permission, Role } from '@/src/types';

type RoleForm = {
  name: string;
  description: string;
  isActive: boolean;
  permissions: string[];
};

const emptyForm: RoleForm = {
  name: '',
  description: '',
  isActive: true,
  permissions: [],
};

const perPage = 15;

function roleToForm(role: Role): RoleForm {
  return {
    name: role.name,
    description: role.description ?? '',
    isActive: Boolean(role.is_active),
    permissions: role.permissions?.map((permission) => permission.name) ?? [],
  };
}

function permissionLabel(name: string) {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function RolesScreen() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const requestIdRef = useRef(0);

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      const group = permission.name.includes('-') ? permission.name.split('-')[0] : 'general';
      groups[group] = [...(groups[group] ?? []), permission];
      return groups;
    }, {});
  }, [permissions]);

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        api.roles({ page: nextPage, perPage, search: debouncedSearch }),
        api.permissions(),
      ]);

      if (requestId !== requestIdRef.current) return;

      setRoles(rolesResponse.data as Role[]);
      setPagination(rolesResponse.meta ?? null);
      setPermissions(permissionsResponse.data as Permission[]);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  if (!hasPermission('users-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  function updateForm<K extends keyof RoleForm>(key: K, value: RoleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function togglePermission(permission: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  function openCreateModal() {
    setEditingRole(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(role: Role) {
    setEditingRole(role);
    setForm(roleToForm(role));
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingRole(null);
    setForm(emptyForm);
  }

  async function saveRole() {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Role name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.isActive,
        permissions: form.permissions,
      };

      if (editingRole) {
        await api.updateRole(editingRole.id, payload);
      } else {
        await api.createRole(payload);
      }

      closeModal();
      await load(editingRole ? page : 1);
      if (!editingRole) setPage(1);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(role: Role) {
    Alert.alert('Delete role?', `Delete ${role.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRole(role);
        },
      },
    ]);
  }

  async function deleteRole(role: Role) {
    setSaving(true);
    try {
      await api.deleteRole(role.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Roles</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {roles.length} shown from {pagination?.total ?? roles.length}
          </Text>
        </View>
        <Button mode="contained" onPress={openCreateModal}>
          Add
        </Button>
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search roles, description, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Role</DataTable.Title>
            <DataTable.Title style={styles.permissionColumn}>Permissions</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {roles.map((role) => (
            <DataTable.Row key={role.id}>
              <DataTable.Cell style={styles.nameColumn}>{role.name}</DataTable.Cell>
              <DataTable.Cell style={styles.permissionColumn}>
                {role.permissions?.length ?? 0}
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {role.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  <Button compact mode="text" onPress={() => openEditModal(role)}>
                    Edit
                  </Button>
                  <Button compact mode="text" textColor="#b42318" onPress={() => confirmDelete(role)}>
                    Delete
                  </Button>
                </View>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button
            mode="outlined"
            disabled={loading || page <= 1}
            onPress={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Text variant="bodyMedium" style={styles.paginationText}>
            Page {pagination.current_page} of {pagination.last_page}
          </Text>
          <Button
            mode="outlined"
            disabled={loading || page >= pagination.last_page}
            onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
          >
            Next
          </Button>
        </View>
      ) : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">{editingRole ? 'Edit Role' : 'Add Role'}</Text>

            <TextInput
              mode="outlined"
              label="Role name"
              value={form.name}
              onChangeText={(value) => updateForm('name', value)}
            />

            <TextInput
              mode="outlined"
              label="Description"
              value={form.description}
              multiline
              onChangeText={(value) => updateForm('description', value)}
            />

            <View style={styles.switchRow}>
              <Text>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(value) => updateForm('isActive', value)}
                disabled={saving}
              />
            </View>

            {Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
              <View key={group} style={styles.permissionGroup}>
                <Text variant="titleMedium" style={styles.groupTitle}>
                  {permissionLabel(group)}
                </Text>
                {groupPermissions.map((permission) => (
                  <Checkbox.Item
                    key={permission.id}
                    label={permissionLabel(permission.name)}
                    status={form.permissions.includes(permission.name) ? 'checked' : 'unchecked'}
                    onPress={() => togglePermission(permission.name)}
                    disabled={saving}
                  />
                ))}
              </View>
            ))}

            <View style={styles.modalActions}>
              <Button mode="text" onPress={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button mode="contained" onPress={saveRole} loading={saving} disabled={saving}>
                Save
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  muted: {
    color: '#667085',
  },
  table: {
    minWidth: 680,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  nameColumn: {
    minWidth: 180,
    flex: 1.2,
  },
  permissionColumn: {
    minWidth: 140,
  },
  statusColumn: {
    minWidth: 120,
  },
  actionColumn: {
    minWidth: 180,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  paginationText: {
    color: '#475467',
  },
  modal: {
    margin: 18,
    maxHeight: '88%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },
  modalContent: {
    padding: 18,
    gap: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  permissionGroup: {
    borderTopWidth: 1,
    borderTopColor: '#eaecf0',
    paddingTop: 8,
  },
  groupTitle: {
    marginBottom: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
