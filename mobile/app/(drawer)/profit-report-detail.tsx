import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { api } from '@/src/lib/api';
import type { ProfitReportDetail } from '@/src/types';

export default function ProfitReportDetailScreen() {
  const { metric, startDate, endDate, warehouseId, search } = useLocalSearchParams<{
    metric?: string;
    startDate?: string;
    endDate?: string;
    warehouseId?: string;
    search?: string;
  }>();
  const [detail, setDetail] = useState<ProfitReportDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!metric) return;

    setLoading(true);
    try {
      const response = await api.profitReportDetail({
        metric,
        startDate,
        endDate,
        warehouseId: warehouseId && warehouseId !== 'all' ? Number(warehouseId) : undefined,
        search,
      });
      setDetail(response);
    } catch (error) {
      Alert.alert('Detail report failed', error instanceof Error ? error.message : 'Unable to load profit detail.');
    } finally {
      setLoading(false);
    }
  }, [endDate, metric, search, startDate, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMargin = detail?.metric.value_type === 'percent';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" style={styles.iconButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#111827" />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text variant="headlineSmall" style={styles.title}>{detail?.metric.label ?? 'Profit Detail'}</Text>
          <Text style={styles.muted}>
            {detail ? `${formatDate(detail.filters.start_date)} - ${formatDate(detail.filters.end_date)}` : 'Loading detail'}
          </Text>
        </View>
        <Button compact mode="outlined" loading={loading} onPress={() => void load()}>Refresh</Button>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} /> : null}

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Final Total</Text>
        <Text style={styles.totalValue}>{formatValue(detail?.summary.total ?? 0, detail?.summary.total_type)}</Text>
        <Text style={styles.muted}>{detail?.summary.row_count ?? 0} entries</Text>
      </View>

      {detail?.summary.components.length ? (
        <View style={styles.panel}>
          <Text variant="titleMedium" style={styles.panelTitle}>Summation</Text>
          {detail.summary.components.map((component) => (
            <View key={component.label} style={styles.summaryRow}>
              <Text style={styles.muted}>{component.label}</Text>
              <Text style={styles.summaryAmount}>{money(component.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text variant="titleMedium" style={styles.panelTitle}>Entries</Text>
        {(detail?.rows ?? []).map((row, index) => (
          <View key={`${row.reference ?? row.label}-${index}`} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <View style={styles.entryTitleWrap}>
                <Text variant="titleSmall" style={styles.entryTitle}>{row.label}</Text>
                <Text style={styles.muted}>{row.reference ?? row.type}</Text>
              </View>
              <Text style={styles.entryAmount}>{formatValue(row.amount, row.amount_type)}</Text>
            </View>
            {isMargin ? (
              <View style={styles.metricGrid}>
                <Metric label="Revenue" value={money(row.revenue ?? 0)} />
                <Metric label="Profit" value={money(row.profit ?? 0)} />
              </View>
            ) : (
              <>
                <Text style={styles.entryType}>{row.type}</Text>
                <Text style={styles.muted}>{row.date ? formatDate(row.date) : '-'}{row.description ? ` · ${row.description}` : ''}</Text>
              </>
            )}
          </View>
        ))}
        {!loading && detail?.rows.length === 0 ? <Text style={styles.muted}>No entries matched these filters.</Text> : null}
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatValue(value: number, type?: string) {
  return type === 'percent' ? percent(value) : money(value);
}

function money(value: number) {
  return `৳${number(value)}`;
}

function percent(value: number) {
  return `${number(value)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    color: '#111827',
    fontWeight: '800',
  },
  muted: {
    color: '#64748b',
  },
  loading: {
    paddingVertical: 16,
  },
  totalCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 6,
  },
  totalLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  totalValue: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '900',
  },
  panel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
  },
  panelTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  summaryRow: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryAmount: {
    color: '#111827',
    fontWeight: '800',
  },
  entryCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  entryTitleWrap: {
    flex: 1,
  },
  entryTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  entryAmount: {
    color: '#111827',
    fontWeight: '900',
  },
  entryType: {
    color: '#334155',
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    padding: 10,
    gap: 4,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: '#111827',
    fontWeight: '800',
  },
});
