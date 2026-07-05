import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, DataTable, Text } from 'react-native-paper';
import type { ActivityLog } from '../types';

const compactChangeLimit = 6;
const compactValueLength = 90;

export function ActivityLogTimeline({ logs = [] }: { logs?: ActivityLog[] }) {
  const sortedLogs = [...logs].sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        <View>
          <Text variant="titleMedium">Activity log</Text>
          <Text variant="bodySmall" style={styles.muted}>
            {sortedLogs.length ? `${sortedLogs.length} recorded event${sortedLogs.length === 1 ? '' : 's'}` : 'No recorded changes yet'}
          </Text>
        </View>

        {sortedLogs.map((log) => (
          <ActivityLogEvent key={log.id} log={log} />
        ))}
      </Card.Content>
    </Card>
  );
}

function ActivityLogEvent({ log }: { log: ActivityLog }) {
  const [expanded, setExpanded] = useState(false);
  const changes = log.changes ?? [];
  const hasHiddenChanges = changes.length > compactChangeLimit;
  const hasLongValues = changes.some((change) => formatValue(change.old).length > compactValueLength || formatValue(change.new).length > compactValueLength);
  const canExpand = hasHiddenChanges || hasLongValues;
  const visibleChanges = expanded ? changes : changes.slice(0, compactChangeLimit);

  return (
    <View style={styles.event}>
      <View style={styles.eventHeader}>
        <View style={styles.eventTitleWrap}>
          <Text variant="titleSmall">{log.description || titleCase(log.event || 'changed')}</Text>
          <Text variant="bodySmall" style={styles.muted}>
            {log.causer?.name ?? 'System'}{log.causer?.email ? ` · ${log.causer.email}` : ''}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.time}>{formatDateTime(log.created_at)}</Text>
      </View>

      {changes.length ? (
        <>
          <DataTable style={styles.table}>
            <DataTable.Header>
              <DataTable.Title style={styles.fieldColumn}>Field</DataTable.Title>
              <DataTable.Title style={styles.valueColumn}>Before</DataTable.Title>
              <DataTable.Title style={styles.valueColumn}>After</DataTable.Title>
            </DataTable.Header>
            {visibleChanges.map((change) => (
              <DataTable.Row key={change.field}>
                <DataTable.Cell style={styles.fieldColumn}>{fieldLabel(change.field)}</DataTable.Cell>
                <DataTable.Cell style={styles.valueColumn} textStyle={styles.before}>{expanded ? formatValue(change.old) : compactValue(change.old)}</DataTable.Cell>
                <DataTable.Cell style={styles.valueColumn} textStyle={styles.after}>{expanded ? formatValue(change.new) : compactValue(change.new)}</DataTable.Cell>
              </DataTable.Row>
            ))}
          </DataTable>
          {canExpand ? (
            <Button compact mode="text" style={styles.showMoreButton} onPress={() => setExpanded((current) => !current)}>
              {expanded ? 'Show less' : `Show more${hasHiddenChanges ? ` (${changes.length - compactChangeLimit} more)` : ''}`}
            </Button>
          ) : null}
        </>
      ) : (
        <Text variant="bodySmall" style={styles.empty}>No field-level changes were recorded for this event.</Text>
      )}
    </View>
  );
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
  event: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12, gap: 8 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  eventTitleWrap: { flex: 1 },
  time: { color: '#6b7280', textAlign: 'right' },
  table: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 },
  fieldColumn: { flex: 0.9 },
  valueColumn: { flex: 1.2 },
  before: { color: '#b91c1c' },
  after: { color: '#047857' },
  showMoreButton: { alignSelf: 'flex-start' },
  empty: { backgroundColor: '#f9fafb', color: '#6b7280', padding: 10, borderRadius: 6 },
});
