import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Menu, Searchbar, Text, TextInput } from 'react-native-paper';
import { Redirect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
  const [exporting, setExporting] = useState(false);

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

  const exportPdf = async () => {
    setExporting(true);
    try {
      const response = await api.profitReportPdf({
        startDate,
        endDate,
        warehouseId: warehouseId === 'all' ? undefined : Number(warehouseId),
        search: debouncedSearch,
      });
      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

      if (!directory) {
        throw new Error('No writable file directory is available on this device.');
      }

      const fileUri = `${directory}profit-report-${startDate}-to-${endDate}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response.data), {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Profit Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF exported', `Saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'Unable to export profit report PDF.');
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary;
  const products = report?.products ?? [];
  const warehouseBreakdown = report?.warehouses ?? [];
  const categories = report?.categories ?? [];
  const expenses = report?.expenses ?? [];
  const cash = report?.cash ?? [];

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Profit Report</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {report ? `${report.filters.start_date} to ${report.filters.end_date}` : 'Current month'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button mode="outlined" icon="refresh" loading={loading} onPress={() => void load()}>Refresh</Button>
          <Button mode="contained" icon="file-pdf-box" loading={exporting} onPress={() => void exportPdf()}>PDF</Button>
        </View>
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
        <SummaryRow label="Gross profit" value={money(summary?.gross_profit)} detail={`${money(summary?.net_cost_of_goods_sold)} COGS`} />
        <SummaryRow label="Expenses" value={money(summary?.expenses)} />
        <SummaryRow label="Net profit" value={money(summary?.net_profit)} />
        <SummaryRow label="Margin" value={percent(summary?.margin_percent)} />
        <SummaryRow label="Cash in" value={money(summary?.cash_in)} />
        <SummaryRow label="Cash out" value={money(summary?.cash_out)} />
        <SummaryRow label="Purchase returns" value={money(summary?.purchase_return_cost)} detail="COGS reduction" />
        <SummaryRow label="Cash movement" value={money(summary?.net_cash_movement)} />
        <SummaryRow label="Tax" value={`${money(summary?.tax_collected)} collected`} detail={`${money(summary?.tax_returned)} returned`} />
        <SummaryRow label="Returns" value={money(summary?.returns)} detail={`${money(summary?.return_cost)} cost`} />
      </View>

      <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
        <Section title="Cash movement">
          {cash.length > 0 ? cash.map((row) => (
            <InfoRow key={`${row.payment_type}-${row.direction}`} label={`${row.label} (${row.direction})`} value={money(row.amount)} />
          )) : <Text variant="bodyMedium" style={styles.muted}>No cash movement in this date range.</Text>}
        </Section>

        <Section title="Expenses">
          {expenses.length > 0 ? expenses.map((row) => (
            <InfoRow key={row.category_id ?? row.category_name} label={row.category_name} value={money(row.amount)} />
          )) : <Text variant="bodyMedium" style={styles.muted}>No expenses in this date range.</Text>}
        </Section>

        <Section title="Warehouse profit">
          {warehouseBreakdown.length > 0 ? warehouseBreakdown.map((row) => (
            <BreakdownRow key={row.id} row={row} />
          )) : <Text variant="bodyMedium" style={styles.muted}>No warehouse rows in this date range.</Text>}
        </Section>

        <Section title="Category profit">
          {categories.length > 0 ? categories.map((row) => (
            <BreakdownRow key={row.id} row={row} hideExpenses />
          )) : <Text variant="bodyMedium" style={styles.muted}>No category rows in this date range.</Text>}
        </Section>

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
              <Metric label="Purchase returns" value={money(product.purchase_return_cost)} />
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="titleMedium">{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="bodyMedium" style={styles.infoLabel}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

function BreakdownRow({
  row,
  hideExpenses = false,
}: {
  row: NonNullable<ProfitReport['warehouses']>[number];
  hideExpenses?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.productHeader}>
        <Text variant="titleSmall" style={styles.productTitle}>{row.name}</Text>
        <Text variant="titleSmall">{money(row.net_profit)}</Text>
      </View>
      <View style={styles.metrics}>
        <Metric label="Revenue" value={money(row.net_revenue)} />
        <Metric label="Cost" value={money(row.cost)} />
        <Metric label="Purchase returns" value={money(row.purchase_return_cost)} />
        {hideExpenses ? <Metric label="Margin" value={percent(row.margin_percent)} /> : <Metric label="Expenses" value={money(row.expenses)} />}
      </View>
      {!hideExpenses ? <Text variant="bodySmall" style={styles.muted}>Margin {percent(row.margin_percent)}</Text> : null}
    </View>
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
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
  headerActions: {
    gap: 8,
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
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionBody: {
    gap: 8,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: '#f3f4f6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  infoLabel: {
    flex: 1,
    paddingRight: 12,
  },
  breakdownRow: {
    borderBottomColor: '#f3f4f6',
    borderBottomWidth: 1,
    gap: 8,
    paddingBottom: 10,
  },
});
