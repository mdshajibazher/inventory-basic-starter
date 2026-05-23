import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
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
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { PaginationMeta, Permission, Role, User } from '@/src/types';

type UserOptions = {
  roles: Role[];
  permissions: Permission[];
};

type RouteParams = {
  refreshKey?: number;
};

type CheckboxStatus = 'checked' | 'unchecked' | 'indeterminate';

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  isActive: boolean;
};

const emptyForm: UserForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  isActive: true,
};

const perPage = 15;

function userRoles(user: User): Role[] {
  return Array.isArray(user.roles)
    ? user.roles.filter((role): role is Role => typeof role === 'object')
    : [];
}

function userToForm(user: User): UserForm {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    password: '',
    isActive: Boolean(user.is_active),
  };
}

function permissionLabel(name: string) {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function permissionNames(permissions: Permission[]) {
  return permissions.map((permission) => permission.name);
}

function sectionStatus(permissions: Permission[], selectedPermissions: string[]): CheckboxStatus {
  const names = permissionNames(permissions);
  const selectedCount = names.filter((name) => selectedPermissions.includes(name)).length;

  if (selectedCount === 0) return 'unchecked';
  if (selectedCount === names.length) return 'checked';
  return 'indeterminate';
}

export default function UsersScreen() {
  const { hasPermission, refreshUser } = useAuth();
  const route = useRoute();
  const [users, setUsers] = useState<User[]>([]);
  const [options, setOptions] = useState<UserOptions>({ roles: [], permissions: [] });
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('users-add');
  const canEdit = hasPermission('users-edit');

  const groupedPermissions = useMemo(() => {
    return options.permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      const group = permission.name.includes('-') ? permission.name.split('-')[0] : 'general';
      groups[group] = [...(groups[group] ?? []), permission];
      return groups;
    }, {});
  }, [options.permissions]);

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const [usersResponse, optionsResponse] = await Promise.all([
        api.users({ page: nextPage, perPage, search: debouncedSearch }),
        api.userOptions(),
      ]);

      if (requestId !== requestIdRef.current) return;

      setUsers(usersResponse.data as User[]);
      setPagination(usersResponse.meta ?? null);
      setOptions(optionsResponse.data as UserOptions);
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
  }, [load, page, refreshKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  function updateForm<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleRole(roleId: number) {
    setSelectedRoles((current) =>
      current.includes(roleId)
        ? current.filter((item) => item !== roleId)
        : [...current, roleId]
    );
  }

  function togglePermission(permission: string) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  }

  function togglePermissionSection(permissions: Permission[]) {
    const names = permissionNames(permissions);

    setSelectedPermissions((current) => {
      const allSelected = names.every((name) => current.includes(name));

      if (allSelected) {
        return current.filter((permission) => !names.includes(permission));
      }

      return Array.from(new Set([...current, ...names]));
    });
  }

  function openCreateModal() {
    setEditingUser(null);
    setForm(emptyForm);
    setModalVisible(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setForm(userToForm(user));
    setModalVisible(true);
  }

  function openRoleModal(user: User) {
    setEditingUser(user);
    setSelectedRoles(userRoles(user).map((role) => role.id));
    setRoleModalVisible(true);
  }

  function openPermissionModal(user: User) {
    setEditingUser(user);
    setSelectedPermissions(user.direct_permissions?.map((permission) => permission.name) ?? []);
    setPermissionModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  function closeRoleModal() {
    setRoleModalVisible(false);
    setEditingUser(null);
    setSelectedRoles([]);
  }

  function closePermissionModal() {
    setPermissionModalVisible(false);
    setEditingUser(null);
    setSelectedPermissions([]);
  }

  async function saveUser() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      Alert.alert('Missing fields', 'Name, email, and phone are required.');
      return;
    }

    if (!editingUser && !form.password.trim()) {
      Alert.alert('Missing password', 'Password is required for new users.');
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
      };

      if (editingUser) {
        await api.updateUser(editingUser.id, payload);
      } else {
        await api.createUser(payload);
      }

      closeModal();
      await load(editingUser ? page : 1);
      if (!editingUser) setPage(1);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRoles() {
    if (!editingUser) return;

    setSaving(true);
    try {
      await api.updateUserRoles(editingUser.id, { roles: selectedRoles });
      const currentUser = await refreshUser();
      closeRoleModal();
      if (currentUser?.permissions?.includes('users-index')) {
        await load(page);
      }
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!editingUser) return;

    setSaving(true);
    try {
      await api.updateUserPermissions(editingUser.id, { permissions: selectedPermissions });
      const currentUser = await refreshUser();
      closePermissionModal();
      if (currentUser?.permissions?.includes('users-index')) {
        await load(page);
      }
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(user: User) {
    Alert.alert('Delete user?', `Delete ${user.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteUser(user);
        },
      },
    ]);
  }

  async function deleteUser(user: User) {
    setSaving(true);
    try {
      await api.deleteUser(user.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('users-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Users</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {users.length} shown from {pagination?.total ?? users.length}
          </Text>
        </View>
        {canAdd ? (
          <Button mode="contained" onPress={openCreateModal}>
            Add
          </Button>
        ) : null}
      </View>

      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search users, email, phone, roles, permissions"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.nameColumn}>Name</DataTable.Title>
            <DataTable.Title style={styles.emailColumn}>Email</DataTable.Title>
            <DataTable.Title style={styles.phoneColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.roleColumn}>Roles</DataTable.Title>
            <DataTable.Title style={styles.permissionColumn}>Permissions</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {users.map((user) => (
            <DataTable.Row key={user.id}>
              <DataTable.Cell style={styles.nameColumn}>{user.name}</DataTable.Cell>
              <DataTable.Cell style={styles.emailColumn}>{user.email}</DataTable.Cell>
              <DataTable.Cell style={styles.phoneColumn}>{user.phone ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.roleColumn}>
                {userRoles(user).map((role) => role.name).join(', ') || '-'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.permissionColumn}>
                {user.permissions?.length ?? 0}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canEdit ? (
                    <>
                      <Button compact mode="text" onPress={() => openEditModal(user)}>
                        Edit
                      </Button>
                      <Button compact mode="text" onPress={() => openRoleModal(user)}>
                        Update Role
                      </Button>
                      <Button compact mode="text" onPress={() => openPermissionModal(user)}>
                        Update Permission
                      </Button>
                    </>
                  ) : null}
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

      {!loading && users.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No users found.
        </Text>
      ) : null}

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">{editingUser ? 'Edit User' : 'Add User'}</Text>

            <TextInput
              mode="outlined"
              label="Name"
              value={form.name}
              onChangeText={(value) => updateForm('name', value)}
            />
            <TextInput
              mode="outlined"
              label="Email"
              value={form.email}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(value) => updateForm('email', value)}
            />
            <TextInput
              mode="outlined"
              label="Phone"
              value={form.phone}
              keyboardType="phone-pad"
              onChangeText={(value) => updateForm('phone', value)}
            />
            <TextInput
              mode="outlined"
              label={editingUser ? 'New password' : 'Password'}
              value={form.password}
              secureTextEntry
              onChangeText={(value) => updateForm('password', value)}
            />

            <View style={styles.switchRow}>
              <Text>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(value) => updateForm('isActive', value)}
                disabled={saving}
              />
            </View>

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button mode="contained" onPress={saveUser} loading={saving} disabled={saving}>
                Save
              </Button>
            </View>
          </ScrollView>
        </Modal>
        <Modal
          visible={roleModalVisible}
          onDismiss={closeRoleModal}
          contentContainerStyle={styles.modal}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">Update Role</Text>
            <Text variant="bodyMedium" style={styles.muted}>
              {editingUser?.name}
            </Text>

            <View style={styles.permissionGroup}>
              {options.roles.map((role) => (
                <Checkbox.Item
                  key={role.id}
                  label={role.name}
                  status={selectedRoles.includes(role.id) ? 'checked' : 'unchecked'}
                  onPress={() => toggleRole(role.id)}
                  disabled={saving}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeRoleModal} disabled={saving}>
                Cancel
              </Button>
              <Button mode="contained" onPress={saveRoles} loading={saving} disabled={saving}>
                Save
              </Button>
            </View>
          </ScrollView>
        </Modal>
        <Modal
          visible={permissionModalVisible}
          onDismiss={closePermissionModal}
          contentContainerStyle={styles.modal}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text variant="titleLarge">Update Permission</Text>
            <Text variant="bodyMedium" style={styles.muted}>
              {editingUser?.name}
            </Text>

            {Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
              <View key={group} style={styles.permissionGroup}>
                <Text variant="titleMedium" style={styles.groupTitle}>
                  {permissionLabel(group)}
                </Text>
                <Checkbox.Item
                  label="Select all"
                  status={sectionStatus(groupPermissions, selectedPermissions)}
                  onPress={() => togglePermissionSection(groupPermissions)}
                  disabled={saving}
                />
                {groupPermissions.map((permission) => (
                  <Checkbox.Item
                    key={permission.id}
                    label={permissionLabel(permission.name)}
                    status={selectedPermissions.includes(permission.name) ? 'checked' : 'unchecked'}
                    onPress={() => togglePermission(permission.name)}
                    disabled={saving}
                  />
                ))}
              </View>
            ))}

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closePermissionModal} disabled={saving}>
                Cancel
              </Button>
              <Button mode="contained" onPress={savePermissions} loading={saving} disabled={saving}>
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  muted: {
    color: '#667085',
  },
  table: {
    minWidth: 1280,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  nameColumn: {
    flex: 1.1,
  },
  emailColumn: {
    flex: 1.4,
  },
  phoneColumn: {
    flex: 1,
  },
  roleColumn: {
    flex: 1.2,
  },
  permissionColumn: {
    flex: 0.9,
  },
  actionColumn: {
    flex: 1.8,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  paginationText: {
    color: '#344054',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#667085',
  },
  modal: {
    margin: 18,
    maxHeight: '88%',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalContent: {
    padding: 18,
    gap: 12,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 10,
  },
});
