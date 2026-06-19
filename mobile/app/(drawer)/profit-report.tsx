import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Menu, Searchbar, Text, TextInput } from 'react-native-paper';
import { Redirect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { ProfitReport, Warehouse } from '@/src/types';

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const initialRange = monthRange();

export default function ProfitReportScreen() {
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [warehouseId, setWarehouseId] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.profitReport({
        startDate,
        endDate,
        warehouseId: warehouseId === 'all' ? undefined : Number(warehouseId),
        search: debouncedSearch,
      });
      setReport(response);
    } catch (error) {
      Alert.alert('Report failed', error instanceof Error ? error.message : 'Unable to load profit report.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, endDate, startDate, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function loadWarehouses() {
      const response = await api.warehouses({ page: 1, perPage: 100, activeOnly: true });
      setWarehouses(response.data as Warehouse[]);
    }

    void loadWarehouses();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const warehouseOptions = useMemo(() => [
    { value: 'all', label: 'All warehouses' },
    ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })),
  ], [warehouses]);

  if (!hasPermission('reports-profit')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  const summary = report?.summary;
  const products = report?.products ?? [];

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Profit Report</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {report ? `${report.filters.start_date} to ${report.filters.end_date}` : 'Current month'}
          </Text>
        </View>
        <Button mode="outlined" icon="refresh" loading={loading} onPress={() => void load()}>Refresh</Button>
      </View>

      <View style={styles.filters}>
        <View style={styles.dateRow}>
          <TextInput
            mode="outlined"
            label="Start"
            value={startDate}
            onChangeText={setStartDate}
            style={styles.dateInput}
          />
          <TextInput
            mode="outlined"
            label="End"
            value={endDate}
            onChangeText={setEndDate}
            style={styles.dateInput}
          />
        </View>
        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Search product code or name"
          loading={loading}
        />
        <SelectMenu
          label="Warehouse"
          value={warehouseId}
          options={warehouseOptions}
          onSelect={setWarehouseId}
        />
      </View>

      <View style={styles.summaryList}>
        <SummaryRow label="Net revenue" value={money(summary?.net_revenue)} />
        <SummaryRow label="COGS" value={money(summary?.cost_of_goods_sold)} />
        <SummaryRow label="Net profit" value={money(summary?.net_profit)} />
        <SummaryRow label="Margin" value={percent(summary?.margin_percent)} />
        <SummaryRow label="Tax" value={`${money(summary?.tax_collected)} collected`} detail={`${money(summary?.tax_returned)} returned`} />
        <SummaryRow label="Returns" value={money(summary?.returns)} detail={`${money(summary?.return_cost)} cost`} />
      </View>

      <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
        {products.map((product) => (
          <View key={product.product_id} style={styles.productRow}>
            <View style={styles.productHeader}>
              <View style={styles.productTitle}>
                <Text variant="titleSmall">{product.name}</Text>
                <Text variant="bodySmall" style={styles.muted}>{product.code}</Text>
              </View>
              <Text variant="titleSmall">{percent(product.margin_percent)}</Text>
            </View>
            <View style={styles.metrics}>
              <Metric label="Net sales" value={money(product.net_sales)} />
              <Metric label="Cost" value={money(product.cost)} />
              <Metric label="Profit" value={money(product.profit)} />
            </View>
            <Text variant="bodySmall" style={styles.muted}>
              Sold {number(product.qty_sold)} · Returned {number(product.qty_returned)} · Net returns {money(product.net_returns)}
            </Text>
          </View>
        ))}
        {!loading && products.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="titleMedium">No profit rows</Text>
            <Text variant="bodyMedium" style={styles.muted}>No product sales or returns matched these filters.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SummaryRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="bodyMedium" style={styles.muted}>{label}</Text>
      <View style={styles.summaryValue}>
        <Text variant="titleMedium">{value}</Text>
        {detail ? <Text variant="bodySmall" style={styles.muted}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="bodySmall" style={styles.muted}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

function SelectMenu({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? label;

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={<Button mode="outlined" onPress={() => setVisible(true)}>{selected}</Button>}
    >
      {options.map((option) => (
        <Menu.Item
          key={option.value}
          title={option.label}
          onPress={() => {
            onSelect(option.value);
            setVisible(false);
          }}
        />
      ))}
    </Menu>
  );
}

function money(value?: number) {
  return `$${number(value ?? 0)}`;
}

function percent(value?: number) {
  return `${number(value ?? 0)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  muted: {
    color: '#6b7280',
  },
  filters: {
    gap: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInput: {
    flex: 1,
  },
  summaryList: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
  },
  summaryRow: {
    alignItems: 'center',
    borderBottomColor: '#f3f4f6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryValue: {
    alignItems: 'flex-end',
  },
  rows: {
    flex: 1,
  },
  rowsContent: {
    gap: 10,
    paddingBottom: 20,
  },
  productRow: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  productHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  productTitle: {
    flex: 1,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    flex: 1,
    padding: 10,
  },
  empty: {
    alignItems: 'center',
    gap: 4,
    padding: 28,
  },
});
