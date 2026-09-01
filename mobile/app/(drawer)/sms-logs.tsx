import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Button, DataTable, Searchbar, Text } from 'react-native-paper';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { PaginationMeta, SmsLog } from '@/src/types';

type RouteParams = {
  refreshKey?: number;
};

const perPage = 15;

export default function SmsLogsScreen() {
  const { hasPermission } = useAuth();
  const route = useRoute();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;

  const load = useCallback(async (nextPage = page) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const response = await api.smsLogs({ page: nextPage, perPage, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return;

      setLogs(response.data);
      setPagination(response.meta ?? null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
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

  if (!hasPermission('super-user')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">SMS Logs</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {logs.length} shown from {pagination?.total ?? logs.length}
          </Text>
        </View>
      </View>

      <Searchbar
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search SMS logs"
        loading={loading}
        onClearIconPress={() => setSearch('')}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DataTable style={styles.table}>
          <DataTable.Header>
            <DataTable.Title style={styles.dateColumn}>Date</DataTable.Title>
            <DataTable.Title style={styles.userColumn}>User</DataTable.Title>
            <DataTable.Title style={styles.phoneColumn}>Phone</DataTable.Title>
            <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
            <DataTable.Title style={styles.recordColumn}>Record</DataTable.Title>
            <DataTable.Title style={styles.messageColumn}>Message</DataTable.Title>
            <DataTable.Title style={styles.responseColumn}>Response</DataTable.Title>
          </DataTable.Header>

          {logs.map((log) => (
            <DataTable.Row key={log.id}>
              <DataTable.Cell style={styles.dateColumn}>{formatDateTime(log.created_at)}</DataTable.Cell>
              <DataTable.Cell style={styles.userColumn}>{log.user_name ?? '-'}</DataTable.Cell>
              <DataTable.Cell style={styles.phoneColumn}>{log.phone_number}</DataTable.Cell>
              <DataTable.Cell style={styles.statusColumn}>{log.status}</DataTable.Cell>
              <DataTable.Cell style={styles.recordColumn}>{recordLabel(log)}</DataTable.Cell>
              <DataTable.Cell style={styles.messageColumn}>{singleLine(log.message)}</DataTable.Cell>
              <DataTable.Cell style={styles.responseColumn}>{singleLine(log.provider_response ?? '-')}</DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>

      {pagination && pagination.last_page > 1 ? (
        <View style={styles.pagination}>
          <Button mode="outlined" disabled={loading || page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Text variant="bodyMedium" style={styles.paginationText}>Page {pagination.current_page} of {pagination.last_page}</Text>
          <Button mode="outlined" disabled={loading || page >= pagination.last_page} onPress={() => setPage((current) => Math.min(pagination.last_page, current + 1))}>Next</Button>
        </View>
      ) : null}

      {!loading && logs.length === 0 ? <Text variant="bodyMedium" style={styles.empty}>No SMS logs found.</Text> : null}
    </Screen>
  );
}

function recordLabel(log: SmsLog) {
  if (!log.record_type && !log.record_id) return '-';

  const type = log.record_type?.replace(/_/g, ' ') ?? 'Record';
  return `${titleCase(type)}${log.record_id ? ` #${log.record_id}` : ''}`;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function singleLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  muted: { color: '#666666' },
  searchbar: { height: 44, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.28)', backgroundColor: '#ffffff' },
  searchbarInput: { minHeight: 0, paddingVertical: 0 },
  table: { minWidth: 1180, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  dateColumn: { flex: 1.1 },
  userColumn: { flex: 1.1 },
  phoneColumn: { flex: 1 },
  statusColumn: { flex: 0.8 },
  recordColumn: { flex: 1.1 },
  messageColumn: { flex: 1.8 },
  responseColumn: { flex: 1.4 },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  paginationText: { color: '#333333' },
  empty: { paddingVertical: 24, textAlign: 'center', color: '#666666' },
});
