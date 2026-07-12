import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, DataTable, Modal, Portal, Text } from 'react-native-paper';
import type { ActivityLog } from '../types';

const compactValueLength = 120;

export function ActivityLogTimeline({ logs = [] }: { logs?: ActivityLog[] }) {
  const sortedLogs = [...logs].sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        <View>
          <Text variant="titleMedium">Activity log</Text>
          <Text variant="bodySmall" style={styles.muted}>
            {sortedLogs.length ? `${sortedLogs.length} recorded event${sortedLogs.length === 1 ? '' : 's'}` : 'No recorded changes yet'}
          </Text>
        </View>

        {sortedLogs.length ? (
          <DataTable style={styles.table}>
            <DataTable.Header>
              <DataTable.Title style={styles.eventColumn}>Event</DataTable.Title>
              <DataTable.Title style={styles.changeColumn}>Fields</DataTable.Title>
              <DataTable.Title style={styles.actionColumn}>Action</DataTable.Title>
            </DataTable.Header>
            {sortedLogs.map((log) => (
              <ActivityLogRow key={log.id} log={log} onView={() => setSelectedLog(log)} />
            ))}
          </DataTable>
        ) : null}
      </Card.Content>

      <Portal>
        <Modal visible={Boolean(selectedLog)} onDismiss={() => setSelectedLog(null)} contentContainerStyle={styles.modal}>
          {selectedLog ? (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <Text variant="titleMedium">{eventTitle(selectedLog)}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {formatDateTime(selectedLog.created_at)}
                  </Text>
                </View>
                <Button compact mode="text" textColor="#000000" onPress={() => setSelectedLog(null)}>
                  Close
                </Button>
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text variant="labelSmall" style={styles.metaLabel}>User</Text>
                  <Text variant="bodyMedium">{selectedLog.causer?.name ?? 'System'}</Text>
                  {selectedLog.causer?.email ? <Text variant="bodySmall" style={styles.muted}>{selectedLog.causer.email}</Text> : null}
                </View>
                <View style={styles.metaItem}>
                  <Text variant="labelSmall" style={styles.metaLabel}>Event</Text>
                  <Text variant="bodyMedium">{selectedLog.event ? titleCase(selectedLog.event) : 'Changed'}</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.detailsTableWrap}>
                  <ActivityLogChangesTable log={selectedLog} />
                </View>
              </ScrollView>
            </View>
          ) : null}
        </Modal>
      </Portal>
    </Card>
  );
}

function ActivityLogRow({ log, onView }: { log: ActivityLog; onView: () => void }) {
  const changes = log.changes ?? [];

  return (
    <DataTable.Row>
      <DataTable.Cell style={styles.eventColumn}>
        <View style={styles.eventCell}>
          <Text variant="bodyMedium" numberOfLines={1}>{eventTitle(log)}</Text>
          <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
            {log.causer?.name ?? 'System'}
          </Text>
          <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
            {formatDateTime(log.created_at)}
          </Text>
        </View>
      </DataTable.Cell>
      <DataTable.Cell style={styles.changeColumn}>
        {changes.length ? `${changes.length}` : '-'}
      </DataTable.Cell>
      <DataTable.Cell style={styles.actionColumn}>
        <Button compact mode="contained" buttonColor="#000000" textColor="#ffffff" style={styles.detailsButton} labelStyle={styles.detailsButtonLabel} onPress={onView}>
          Details
        </Button>
      </DataTable.Cell>
    </DataTable.Row>
  );
}

function ActivityLogChangesTable({ log }: { log: ActivityLog }) {
  const changes = log.changes ?? [];

  if (!changes.length) {
    return <Text variant="bodySmall" style={styles.empty}>No field-level changes were recorded for this event.</Text>;
  }

  return (
    <DataTable style={styles.table}>
      <DataTable.Header>
        <DataTable.Title style={styles.fieldColumn}>Field</DataTable.Title>
        <DataTable.Title style={styles.valueColumn}>Before</DataTable.Title>
        <DataTable.Title style={styles.valueColumn}>After</DataTable.Title>
      </DataTable.Header>
      {changes.map((change) => (
        <DataTable.Row key={change.field}>
          <DataTable.Cell style={styles.fieldColumn}>{fieldLabel(change.field)}</DataTable.Cell>
          <DataTable.Cell style={styles.valueColumn} textStyle={styles.before}>{compactValue(change.old)}</DataTable.Cell>
          <DataTable.Cell style={styles.valueColumn} textStyle={styles.after}>{compactValue(change.new)}</DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable>
  );
}

function eventTitle(log: ActivityLog): string {
  return log.description || titleCase(log.event || 'changed');
}

function fieldLabel(field: string): string {
  return titleCase(field.replace(/_id$/, '').replace(/_/g, ' '));
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Blank';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function compactValue(value: unknown): string {
  const formatted = formatValue(value);
  return formatted.length > compactValueLength ? `${formatted.slice(0, compactValueLength)}...` : formatted;
}

function timestamp(value?: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff' },
  content: { gap: 12 },
  muted: { color: '#6b7280' },
  table: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 },
  eventColumn: { flex: 1.7 },
  changeColumn: { flex: 0.6, justifyContent: 'center' },
  actionColumn: { flex: 0.9, justifyContent: 'flex-end' },
  eventCell: { flex: 1, paddingVertical: 6 },
  detailsButton: { borderRadius: 6, minWidth: 72 },
  detailsButtonLabel: { fontSize: 12, marginHorizontal: 8, marginVertical: 2 },
  modal: { margin: 16, maxHeight: '86%', borderRadius: 8, backgroundColor: '#ffffff' },
  modalContent: { gap: 14, padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitleWrap: { flex: 1 },
  metaGrid: { flexDirection: 'row', gap: 10 },
  metaItem: { flex: 1, borderRadius: 6, backgroundColor: '#f9fafb', padding: 10 },
  metaLabel: { color: '#6b7280', textTransform: 'uppercase' },
  detailsTableWrap: { minWidth: 620 },
  fieldColumn: { flex: 0.9 },
  valueColumn: { flex: 1.2 },
  before: { color: '#b91c1c' },
  after: { color: '#047857' },
  empty: { backgroundColor: '#f9fafb', color: '#6b7280', padding: 10, borderRadius: 6 },
});
