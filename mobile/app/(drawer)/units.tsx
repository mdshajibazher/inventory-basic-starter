import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from 'expo-router/react-navigation';
import { Redirect } from 'expo-router';
import {
  Button,
  DataTable,
  HelperText,
  Menu,
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
import type { PaginationMeta, Unit, UnitGroup } from '@/src/types';

type UnitForm = {
  unitCode: string;
  unitName: string;
  unitGroupId: number | null;
  baseUnit: number | null;
  operator: string | null;
  operationValue: string;
  isActive: boolean;
};

type RouteParams = {
  refreshKey?: number;
};

const emptyForm: UnitForm = {
  unitCode: '',
  unitName: '',
  unitGroupId: null,
  baseUnit: null,
  operator: '*',
  operationValue: '1',
  isActive: true,
};

const perPage = 15;
const operatorOptions = ['*', '/'];

export default function UnitsScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupMenuVisible, setGroupMenuVisible] = useState(false);
  const [baseMenuVisible, setBaseMenuVisible] = useState(false);
  const [operatorMenuVisible, setOperatorMenuVisible] = useState(false);
  const [form, setForm] = useState<UnitForm>(emptyForm);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;
  const canAdd = hasPermission('units-add');
  const canDelete = hasPermission('units-delete');

  const selectedGroup = useMemo(
    () => unitGroups.find((group) => group.id === form.unitGroupId),
    [unitGroups, form.unitGroupId]
  );

  const selectedBase = useMemo(
    () => units.find((unit) => unit.id === form.baseUnit),
    [units, form.baseUnit]
  );

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await api.units({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setUnits(response.data as Unit[]);
      setPagination(response.meta ?? null);
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
    let mounted = true;

    api.unitGroups()
      .then((response) => {
        if (mounted) setUnitGroups(response.data as UnitGroup[]);
      })
      .catch((error) => {
        if (mounted) Alert.alert('Unit groups failed', error instanceof Error ? error.message : 'Try again.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  function updateForm<K extends keyof UnitForm>(key: K, value: UnitForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateBaseUnit(baseUnit: number | null) {
    setForm((current) => ({
      ...current,
      baseUnit,
      operator: baseUnit ? current.operator ?? '*' : '*',
      operationValue: baseUnit ? current.operationValue || '1' : '1',
    }));
  }

  function openCreateModal() {
    setForm(emptyForm);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setGroupMenuVisible(false);
    setBaseMenuVisible(false);
    setOperatorMenuVisible(false);
    setForm(emptyForm);
  }

  async function saveUnit() {
    if (!form.unitCode.trim() || !form.unitName.trim()) {
      Alert.alert('Missing fields', 'Unit code and unit name are required.');
      return;
    }

    if (!form.unitGroupId) {
      Alert.alert('Missing unit group', 'Unit group is required.');
      return;
    }

    const hasBaseUnit = form.baseUnit !== null;
    const operationValue = form.operationValue.trim();

    if (hasBaseUnit && (!form.operator || !operationValue)) {
      Alert.alert('Missing conversion', 'Operator and operation value are required.');
      return;
    }

    const payload = {
      unit_code: form.unitCode.trim(),
      unit_name: form.unitName.trim(),
      unit_group_id: form.unitGroupId,
      base_unit: form.baseUnit,
      operator: hasBaseUnit ? form.operator : '*',
      operation_value: hasBaseUnit ? Number(operationValue) : 1,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      await api.createUnit(payload);

      closeModal();
      if (page === 1) {
        await load(1);
      } else {
        setPage(1);
      }
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(unit: Unit) {
    Alert.alert('Delete unit?', `Delete ${unit.unit_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteUnit(unit);
        },
      },
    ]);
  }

  async function deleteUnit(unit: Unit) {
    setSaving(true);
    try {
      await api.deleteUnit(unit.id);
      await load(page);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission('units-index')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Units</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {units.length} shown from {pagination?.total ?? units.length}
          </Text>
          <Text variant="bodySmall" style={styles.warning}>
            Units cannot be edited after creation. Used units cannot be deleted.
          </Text>
        </View>
        {canAdd ? (
          <Button mode="contained" onPress={openCreateModal}>
            Add
          </Button>
        ) : null}
      </View>
      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search units, base, operator, status"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.codeColumn}>Code</DataTable.Title>
            <DataTable.Title style={styles.nameColumn}>Unit</DataTable.Title>
            <DataTable.Title style={styles.groupColumn}>Group</DataTable.Title>
            <DataTable.Title style={styles.baseColumn}>Base</DataTable.Title>
            <DataTable.Title style={styles.operatorColumn}>Operator</DataTable.Title>
            <DataTable.Title numeric style={styles.valueColumn}>
              Value
            </DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
          </DataTable.Header>

          {units.map((unit) => (
            <DataTable.Row key={unit.id}>
              <DataTable.Cell style={styles.codeColumn}>{unit.unit_code}</DataTable.Cell>
              <DataTable.Cell style={styles.nameColumn}>{unit.unit_name}</DataTable.Cell>
              <DataTable.Cell style={styles.groupColumn}>
                {unit.unit_group_title ?? unit.unit_group?.title ?? '-'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.baseColumn}>
                {unit.base_unit_name ?? unit.base?.unit_name ?? 'Base unit'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.operatorColumn}>{unit.operator ?? '-'}</DataTable.Cell>
              <DataTable.Cell numeric style={styles.valueColumn}>
                {unit.operation_value ?? '-'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>
                {unit.is_active ? 'Active' : 'Inactive'}
              </DataTable.Cell>
              <DataTable.Cell style={styles.actionColumn}>
                <View style={styles.actions}>
                  {canDelete && unit.can_delete !== false ? (
                    <Button compact mode="text" textColor="#000000" onPress={() => confirmDelete(unit)}>
                      Delete
                    </Button>
                  ) : (
                    <Text variant="bodySmall" style={styles.muted}>
                      {unit.can_delete === false ? 'In use' : '-'}
                    </Text>
                  )}
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

      {!loading && units.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No units found.
        </Text>
      ) : null}

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge">Add Unit</Text>

          <TextInput
            mode="outlined"
            label="Unit code"
            value={form.unitCode}
            onChangeText={(value) => updateForm('unitCode', value)}
          />
          <TextInput
            mode="outlined"
            label="Unit name"
            value={form.unitName}
            onChangeText={(value) => updateForm('unitName', value)}
          />

          <Menu
            visible={groupMenuVisible}
            onDismiss={() => setGroupMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                contentStyle={styles.menuButton}
                onPress={() => setGroupMenuVisible(true)}
              >
                {selectedGroup?.title ?? 'Select unit group'}
              </Button>
            }
          >
            {unitGroups.map((group) => (
              <Menu.Item
                key={group.id}
                title={group.title}
                onPress={() => {
                  updateForm('unitGroupId', group.id);
                  setGroupMenuVisible(false);
                }}
              />
            ))}
          </Menu>
          <HelperText type="info" visible={unitGroups.length === 0}>
            Unit groups are required before saving units.
          </HelperText>

          <Menu
            visible={baseMenuVisible}
            onDismiss={() => setBaseMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                contentStyle={styles.menuButton}
                onPress={() => setBaseMenuVisible(true)}
              >
                {selectedBase?.unit_name ?? 'No base unit'}
              </Button>
            }
          >
            <Menu.Item
              title="No base unit"
              onPress={() => {
                updateBaseUnit(null);
                setBaseMenuVisible(false);
              }}
            />
            {units.map((unit) => (
              <Menu.Item
                key={unit.id}
                title={unit.unit_name}
                onPress={() => {
                  updateBaseUnit(unit.id);
                  setBaseMenuVisible(false);
                }}
              />
            ))}
          </Menu>
          <HelperText type="info" visible={units.length === 0}>
            Save more units to choose a base unit.
          </HelperText>

          {form.baseUnit !== null ? (
            <>
              <Menu
                visible={operatorMenuVisible}
                onDismiss={() => setOperatorMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    contentStyle={styles.menuButton}
                    onPress={() => setOperatorMenuVisible(true)}
                  >
                    {form.operator ?? '*'}
                  </Button>
                }
              >
                {operatorOptions.map((operator) => (
                  <Menu.Item
                    key={operator}
                    title={operator}
                    onPress={() => {
                      updateForm('operator', operator);
                      setOperatorMenuVisible(false);
                    }}
                  />
                ))}
              </Menu>

              <TextInput
                mode="outlined"
                label="Operation value"
                value={form.operationValue}
                keyboardType="decimal-pad"
                onChangeText={(value) => updateForm('operationValue', value)}
              />
            </>
          ) : null}

          <View style={styles.switchRow}>
            <View>
              <Text variant="titleSmall">Active</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Show this unit as available.
              </Text>
            </View>
            <Switch
              value={form.isActive}
              onValueChange={(value) => updateForm('isActive', value)}
            />
          </View>

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={saveUnit} loading={saving} disabled={saving}>
              Save
            </Button>
          </View>
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
    color: '#666666',
  },
  warning: {
    marginTop: 4,
    color: '#a15c00',
  },
  searchbar: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.28)',
    backgroundColor: '#ffffff',
  },
  searchbarInput: {
    minHeight: 0,
    paddingVertical: 0,
  },
  table: {
    minWidth: 820,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  codeColumn: {
    flex: 0.8,
  },
  nameColumn: {
    flex: 1.2,
  },
  groupColumn: {
    flex: 1,
  },
  baseColumn: {
    flex: 1.1,
  },
  operatorColumn: {
    flex: 0.8,
  },
  valueColumn: {
    flex: 0.8,
  },
  statusColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 1.1,
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
    color: '#333333',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#666666',
  },
  modal: {
    margin: 18,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  menuButton: {
    justifyContent: 'flex-start',
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
