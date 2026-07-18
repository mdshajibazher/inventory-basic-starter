import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Menu, Text, TextInput } from 'react-native-paper';
import { Redirect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { ProfitReport, Warehouse } from '@/src/types';

type Tone = 'green' | 'blue' | 'purple' | 'amber' | 'red' | 'orange';

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
  const router = useRouter();
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
      try {
        const response = await api.warehouses({ page: 1, perPage: 100, activeOnly: true });
        setWarehouses(response.data as Warehouse[]);
      } catch (error) {
        Alert.alert('Warehouse options failed', error instanceof Error ? error.message : 'Unable to load warehouses.');
      }
    }

    void loadWarehouses();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const warehouseOptions = useMemo(() => [
    { value: 'all', label: 'All Warehouses' },
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
  const totalDiscount = (summary?.sales_discounts ?? 0) + (summary?.order_discounts ?? 0) + (summary?.coupon_discounts ?? 0);
  const totalSold = products.reduce((sum, product) => sum + Number(product.qty_sold ?? 0), 0);
  const averageOrderValue = totalSold > 0 ? Number(summary?.net_revenue ?? 0) / totalSold : 0;
  const profitPerProduct = products.length ? Number(summary?.net_profit ?? 0) / products.length : 0;

  function openDetail(metric: string) {
    router.push({
      pathname: '/(drawer)/profit-report-detail',
      params: {
        metric,
        startDate,
        endDate,
        warehouseId,
        search: debouncedSearch,
      },
    });
  }

  return (
    <Screen edges={['right', 'bottom', 'left']} safeStyle={styles.safe} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#050505" />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text variant="headlineMedium" style={styles.title}>Profit Report</Text>
          <Text variant="bodyLarge" style={styles.muted}>{formatDate(startDate)} - {formatDate(endDate)}</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void exportPdf()} disabled={exporting}>
          <MaterialCommunityIcons name="tray-arrow-up" size={28} color="#050505" />
        </Pressable>
      </View>

      <View style={styles.filterBar}>
        <FilterInput icon="calendar-month-outline" label={`${formatShortDate(startDate)} - ${formatShortDate(endDate)}`} />
        <SelectMenu
          value={warehouseId}
          options={warehouseOptions}
          onSelect={setWarehouseId}
        />
        <View style={styles.filterButtonWrap}>
          <Button mode="contained" buttonColor="#050505" textColor="#ffffff" style={styles.filterButton} contentStyle={styles.filterButtonContent} icon="filter-outline" loading={loading} onPress={() => void load()}>
            Filter
          </Button>
        </View>
      </View>

      <View style={styles.hiddenSearch}>
        <TextInput
          mode="outlined"
          value={search}
          onChangeText={setSearch}
          placeholder="Product code or name"
          dense
        />
      </View>

      <View style={styles.kpiGrid}>
        <SummaryCard onPress={() => openDetail('net_revenue')} icon="sack-percent" tone="green" label="Net Revenue" value={money(summary?.net_revenue)} />
        <SummaryCard onPress={() => openDetail('gross_profit')} icon="chart-bar" tone="blue" label="Gross Profit" value={money(summary?.gross_profit)} detail={`COGS ${money(summary?.net_cost_of_goods_sold)}`} />
        <SummaryCard onPress={() => openDetail('expenses')} icon="receipt-text-outline" tone="purple" label="Expenses" value={money(summary?.expenses)} />
        <SummaryCard onPress={() => openDetail('net_profit')} icon="wallet-outline" tone="green" label="Net Profit" value={money(summary?.net_profit)} />
        <SummaryCard onPress={() => openDetail('margin')} icon="chart-pie" tone="amber" label="Margin" value={percent(summary?.margin_percent)} />
        <SummaryCard onPress={() => openDetail('cash_in')} icon="arrow-down-bold" tone="green" label="Cash In" value={money(summary?.cash_in)} />
        <SummaryCard onPress={() => openDetail('cash_out')} icon="arrow-up-bold" tone="red" label="Cash Out" value={money(summary?.cash_out)} />
        <SummaryCard onPress={() => openDetail('net_cash_movement')} icon="swap-horizontal" tone="blue" label="Cash Movement" value={money(summary?.net_cash_movement)} />
        <SummaryCard onPress={() => openDetail('tax')} icon="file-document-outline" tone="red" label="Tax" value={money(summary?.tax_collected)} detail={`Returned ${money(summary?.tax_returned)}`} />
        <SummaryCard onPress={() => openDetail('returns')} icon="undo-variant" tone="orange" label="Returns" value={money(summary?.returns)} detail={`Sales cost ${money(summary?.return_cost)}`} />
        <SummaryCard onPress={() => openDetail('purchase_returns')} icon="cart-outline" tone="blue" label="Purchase Returns" value={money(summary?.purchase_return_cost)} detail="COGS reduction" />
        <SummaryCard onPress={() => openDetail('discounts')} icon="brightness-percent" tone="amber" label="Discounts" value={money(totalDiscount)} detail={`Shipping ${money(summary?.shipping)}`} />
      </View>

      <View style={styles.chartRow}>
        <Panel title="Profit Overview" style={styles.chartPanel}>
          <ProfitOverview products={products} expenses={Number(summary?.expenses ?? 0)} />
        </Panel>
        <Panel title="Profit Distribution" style={styles.chartPanel}>
          <View style={styles.donutRow}>
            <Donut label="Gross Profit" value={money(summary?.gross_profit)} percent={distribution(summary?.gross_profit, summary)} tone="green" />
            <Donut label="Expenses" value={money(summary?.expenses)} percent={distribution(summary?.expenses, summary)} tone="purple" />
            <Donut label="Net Profit" value={money(summary?.net_profit)} percent={distribution(summary?.net_profit, summary)} tone="green" />
          </View>
        </Panel>
      </View>

      <View style={styles.sideMetricBar}>
        <SideMetric icon="cart-outline" tone="green" label="Total Orders" value={number(products.length)} />
        <SideMetric icon="cube-outline" tone="blue" label="Total Items Sold" value={number(totalSold)} />
        <SideMetric icon="clipboard-text-outline" tone="purple" label="Avg. Order Value" value={money(averageOrderValue)} />
        <SideMetric icon="seal-variant" tone="orange" label="Profit per Order" value={money(profitPerProduct)} />
      </View>

      <View style={styles.twoColumn}>
        <CompactSection icon="swap-horizontal" tone="green" title="Cash Movement">
          {cash.slice(0, 2).map((row) => (
            <CompactRow key={`${row.payment_type}-${row.direction}`} label={row.label} middle={row.direction === 'in' ? 'In' : 'Out'} value={money(row.amount)} />
          ))}
          {!cash.length ? <Text style={styles.muted}>No cash movement</Text> : null}
        </CompactSection>

        <CompactSection icon="undo-variant" tone="blue" title="Top Expenses">
          {expenses.slice(0, 2).map((row) => <CompactRow key={row.category_id ?? row.category_name} label={row.category_name} value={money(row.amount)} />)}
          {!expenses.length ? <Text style={styles.muted}>No expenses</Text> : null}
        </CompactSection>

        <CompactSection icon="warehouse" tone="purple" title="Warehouse Profit">
          {warehouseBreakdown.slice(0, 2).map((row) => <CompactRow key={row.id} label={row.name} value={money(row.net_profit)} />)}
          {!warehouseBreakdown.length ? <Text style={styles.muted}>No warehouse rows</Text> : null}
        </CompactSection>

        <CompactSection icon="shape-outline" tone="blue" title="Category Profit">
          {categories.slice(0, 2).map((row) => <CompactRow key={row.id} label={row.name} value={money(row.net_profit)} subValue={percent(row.margin_percent)} />)}
          {!categories.length ? <Text style={styles.muted}>No category rows</Text> : null}
        </CompactSection>
      </View>

      <Panel title="Product Profit Breakdown" icon="cart-outline" tone="green">
        {products.slice(0, 4).map((product) => (
          <View key={product.product_id} style={styles.productRow}>
            <View style={styles.productIcon}>
              <MaterialCommunityIcons name="fruit-cherries" size={28} color="#ef4444" />
            </View>
            <View style={styles.productName}>
              <Text variant="titleSmall" style={styles.semibold}>{product.name}</Text>
              <Text variant="bodySmall" style={styles.muted}>SKU: {product.code}</Text>
            </View>
            <Metric label="Sold" value={number(product.qty_sold)} />
            <Metric label="Net Sales" value={money(product.net_sales)} />
            <Metric label="Net Profit" value={money(product.profit)} subValue={percent(product.margin_percent)} />
          </View>
        ))}
        {!products.length ? (
          <View style={styles.empty}>
            <Text variant="titleMedium">No profit rows</Text>
            <Text variant="bodyMedium" style={styles.muted}>No product sales or returns matched these filters.</Text>
          </View>
        ) : null}
      </Panel>
    </Screen>
  );
}

function SummaryCard({ icon, tone, label, value, detail, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: Tone; label: string; value: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.summaryCard}>
      <View style={[styles.iconTile, toneStyle(tone).soft]}>
        <MaterialCommunityIcons name={icon} size={28} color={toneStyle(tone).color} />
      </View>
      <View style={styles.summaryText}>
        <Text variant="titleMedium" style={styles.cardLabel}>{label}</Text>
        <Text variant="titleLarge" style={styles.cardValue}>{value}</Text>
        {detail ? <Text variant="bodySmall" style={styles.muted}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

function Panel({ title, children, icon, tone = 'green', style }: { title: string; children: ReactNode; icon?: keyof typeof MaterialCommunityIcons.glyphMap; tone?: Tone; style?: object }) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleWrap}>
          {icon ? (
            <View style={[styles.smallIconTile, toneStyle(tone).soft]}>
              <MaterialCommunityIcons name={icon} size={20} color={toneStyle(tone).color} />
            </View>
          ) : null}
          <Text variant="titleMedium" style={styles.panelTitle}>{title}</Text>
        </View>
        <Text style={styles.linkText}>See all</Text>
      </View>
      {children}
    </View>
  );
}

function CompactSection({ icon, tone, title, children }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: Tone; title: string; children: ReactNode }) {
  return (
    <Panel title={title} icon={icon} tone={tone} style={styles.compactPanel}>
      <View style={styles.compactBody}>{children}</View>
    </Panel>
  );
}

function CompactRow({ label, middle, value, subValue }: { label: string; middle?: string; value: string; subValue?: string }) {
  return (
    <View style={styles.compactRow}>
      <Text style={styles.compactLabel}>{label}</Text>
      {middle ? <Text style={styles.compactMiddle}>{middle}</Text> : null}
      <View style={styles.compactValueWrap}>
        <Text style={styles.compactValue}>{value}</Text>
        {subValue ? <Text style={styles.positiveText}>{subValue}</Text> : null}
      </View>
    </View>
  );
}

function SideMetric({ icon, tone, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: Tone; label: string; value: string }) {
  return (
    <View style={styles.sideMetric}>
      <View style={[styles.smallIconTile, toneStyle(tone).soft]}>
        <MaterialCommunityIcons name={icon} size={22} color={toneStyle(tone).color} />
      </View>
      <View style={styles.sideMetricText}>
        <Text style={styles.muted}>{label}</Text>
        <Text style={styles.sideMetricValue}>{value}</Text>
      </View>
    </View>
  );
}

function ProfitOverview({ products, expenses }: { products: ProfitReport['products']; expenses: number }) {
  const rows = products.slice(0, 8);
  const max = Math.max(1, ...rows.map((product) => Math.abs(Number(product.profit ?? 0))), expenses);

  return (
    <View style={styles.overview}>
      <View style={styles.legendRow}>
        <Legend color="#22c55e" label="Net Profit" />
        <Legend color="#2563eb" label="Gross Profit" />
        <Legend color="#ef4444" label="Expenses" />
      </View>
      <View style={styles.chartArea}>
        {[0, 1, 2, 3].map((line) => <View key={line} style={[styles.gridLine, { top: 22 + line * 34 }]} />)}
        <View style={styles.barRow}>
          {(rows.length ? rows : [{ product_id: 0, name: 'No data', profit: 0, gross_profit: 0 } as ProfitReport['products'][number]]).map((product, index) => (
            <View key={`${product.product_id}-${index}`} style={styles.barGroup}>
              <View style={[styles.bar, styles.netBar, { height: Math.max(6, Math.abs(Number(product.profit ?? 0)) / max * 120) }]} />
              <View style={[styles.bar, styles.grossBar, { height: Math.max(6, Math.abs(Number(product.gross_profit ?? product.profit ?? 0)) / max * 120) }]} />
              <View style={[styles.bar, styles.expenseBar, { height: Math.max(4, expenses / max * 30) }]} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Donut({ label, value, percent: percentValue, tone }: { label: string; value: string; percent: number; tone: Tone }) {
  return (
    <View style={styles.donutWrap}>
      <View style={[styles.donut, { borderColor: toneStyle(tone).color }]}>
        <View style={styles.donutHole}>
          <Text style={styles.donutPercent}>{number(percentValue)}%</Text>
        </View>
      </View>
      <Text style={styles.donutLabel}>{label}</Text>
      <Text style={styles.donutValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {subValue ? <Text style={styles.positiveText}>{subValue}</Text> : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendLine, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function FilterInput({ icon, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }) {
  return (
    <View style={styles.filterInput}>
      <MaterialCommunityIcons name={icon} size={19} color="#050505" />
      <Text style={styles.filterLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-down" size={20} color="#050505" />
    </View>
  );
}

function SelectMenu({ value, options, onSelect }: { value: string; options: { value: string; label: string }[]; onSelect: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? 'All Warehouses';

  return (
    <View style={styles.selectMenuWrap}>
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={(
          <Pressable style={styles.menuFilterInput} onPress={() => setVisible(true)}>
            <MaterialCommunityIcons name="warehouse" size={19} color="#050505" />
            <Text style={styles.filterLabel} numberOfLines={1}>{selected}</Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color="#050505" />
          </Pressable>
        )}
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
    </View>
  );
}

function toneStyle(tone: Tone) {
  const map = {
    green: { color: '#16a34a', soft: { backgroundColor: '#dcfce7' } },
    blue: { color: '#2563eb', soft: { backgroundColor: '#dbeafe' } },
    purple: { color: '#7c3aed', soft: { backgroundColor: '#ede9fe' } },
    amber: { color: '#f59e0b', soft: { backgroundColor: '#fef3c7' } },
    red: { color: '#ef4444', soft: { backgroundColor: '#fee2e2' } },
    orange: { color: '#f97316', soft: { backgroundColor: '#ffedd5' } },
  };

  return map[tone];
}

function distribution(value: number | undefined, summary: ProfitReport['summary'] | undefined) {
  const total = Math.max(1, Math.abs(summary?.gross_profit ?? 0) + Math.abs(summary?.expenses ?? 0) + Math.abs(summary?.net_profit ?? 0));
  return Math.abs(value ?? 0) / total * 100;
}

function money(value?: number) {
  return `৳${number(value ?? 0)}`;
}

function percent(value?: number) {
  return `${number(value ?? 0)}%`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
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
    backgroundColor: '#f8fafc',
    gap: 14,
    paddingBottom: 28,
    paddingTop: 18,
  },
  safe: {
    backgroundColor: '#f8fafc',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 8,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    color: '#050505',
    fontWeight: '800',
  },
  muted: {
    color: '#64748b',
  },
  semibold: {
    fontWeight: '700',
  },
  filterBar: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterInput: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '100%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  menuFilterInput: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    width: '100%',
  },
  selectMenuWrap: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  filterLabel: {
    color: '#111827',
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  filterButton: {
    borderRadius: 12,
  },
  filterButtonWrap: {
    flexBasis: '100%',
  },
  filterButtonContent: {
    height: 46,
    paddingHorizontal: 8,
  },
  hiddenSearch: {
    display: 'none',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    flexBasis: '100%',
    flexDirection: 'row',
    gap: 10,
    minHeight: 112,
    padding: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    color: '#475569',
    fontWeight: '500',
  },
  cardValue: {
    color: '#050505',
    fontWeight: '800',
    marginTop: 4,
  },
  chartRow: {
    flexDirection: 'column',
    gap: 12,
  },
  chartPanel: {
    flex: 1,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    overflow: 'hidden',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  panelTitle: {
    color: '#050505',
    fontWeight: '800',
  },
  linkText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  smallIconTile: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  overview: {
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
  },
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendLine: {
    borderRadius: 999,
    height: 4,
    width: 20,
  },
  legendText: {
    color: '#475569',
    fontSize: 12,
  },
  chartArea: {
    height: 170,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gridLine: {
    backgroundColor: '#e5e7eb',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  barRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-around',
  },
  barGroup: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
  },
  bar: {
    borderRadius: 999,
    width: 5,
  },
  netBar: {
    backgroundColor: '#22c55e',
  },
  grossBar: {
    backgroundColor: '#2563eb',
  },
  expenseBar: {
    backgroundColor: '#ef4444',
  },
  donutRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  donutWrap: {
    alignItems: 'center',
    flex: 1,
  },
  donut: {
    alignItems: 'center',
    borderRadius: 43,
    borderWidth: 8,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  donutHole: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 33,
    height: 66,
    justifyContent: 'center',
    width: 66,
  },
  donutPercent: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  donutLabel: {
    color: '#475569',
    fontSize: 13,
    marginTop: 8,
  },
  donutValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  sideMetricBar: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  sideMetric: {
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexBasis: '50%',
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  sideMetricText: {
    flex: 1,
  },
  sideMetricValue: {
    color: '#050505',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 3,
  },
  twoColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  compactPanel: {
    flexBasis: '100%',
    flexGrow: 1,
  },
  compactBody: {
    gap: 10,
  },
  compactRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  compactLabel: {
    color: '#111827',
    flex: 1,
    fontSize: 14,
  },
  compactMiddle: {
    color: '#111827',
    fontSize: 14,
  },
  compactValueWrap: {
    alignItems: 'flex-end',
  },
  compactValue: {
    color: '#050505',
    fontSize: 15,
    fontWeight: '700',
  },
  positiveText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  productRow: {
    alignItems: 'center',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 12,
  },
  productIcon: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  productName: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  metric: {
    flexBasis: '30%',
    flexGrow: 1,
  },
  metricLabel: {
    color: '#475569',
    fontSize: 13,
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    gap: 4,
    padding: 28,
  },
});
