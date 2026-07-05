import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Searchbar, Text, TextInput } from 'react-native-paper';
import { Redirect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import type { DatewiseProductReport } from '@/src/types';

type ProductOption = {
  id: number;
  name: string;
  code?: string | null;
};

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

const initialRange = currentMonthRange();

export default function DatewiseProductReportScreen() {
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<DatewiseProductReport | null>(null);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!selectedProduct) {
      Alert.alert('Product required', 'Select a product before generating the report.');
      setReport(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.datewiseProductReport({
        productId: selectedProduct.id,
        startDate,
        endDate,
      });
      setReport(response);
    } catch (error) {
      Alert.alert('Report failed', error instanceof Error ? error.message : 'Unable to load datewise product report.');
    } finally {
      setLoading(false);
    }
  }, [endDate, selectedProduct, startDate]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setProductsLoading(true);
      try {
        const response = await api.products({ page: 1, perPage: 20, search: productSearch.trim() });
        setProductOptions(response.data as ProductOption[]);
      } catch (error) {
        Alert.alert('Product search failed', error instanceof Error ? error.message : 'Unable to search products.');
      } finally {
        setProductsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [productSearch]);

  if (!hasPermission('reports-profit')) {
    return <Redirect href="/(drawer)/dashboard" />;
  }

  const exportPdf = async () => {
    if (!selectedProduct) {
      Alert.alert('Product required', 'Select a product before exporting the report.');
      return;
    }

    setExporting(true);
    try {
      const response = await api.datewiseProductReportPdf({
        productId: selectedProduct.id,
        startDate,
        endDate,
      });
      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

      if (!directory) {
        throw new Error('No writable file directory is available on this device.');
      }

      const fileUri = `${directory}datewise-product-report-${startDate}-to-${endDate}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response.data), {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Datewise Product Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF exported', `Saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'Unable to export datewise product report PDF.');
    } finally {
      setExporting(false);
    }
  };

  const rows = report?.rows ?? [];
  const summary = report?.summary;

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall">Datewise Product Report</Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {report ? `${report.filters.product.name} · ${report.filters.start_date} to ${report.filters.end_date}` : 'Select a product to generate the report'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button mode="outlined" icon="refresh" loading={loading} onPress={() => void load()}>Refresh</Button>
          <Button mode="contained" icon="file-pdf-box" loading={exporting} disabled={!report} onPress={() => void exportPdf()}>PDF</Button>
        </View>
      </View>

      <View style={styles.filters}>
        <Searchbar
          value={productSearch}
          onChangeText={(value) => {
            setProductSearch(value);
            setSelectedProduct(null);
            setReport(null);
          }}
          placeholder="Search and select product"
          loading={productsLoading}
        />
        {productsLoading ? <ActivityIndicator style={styles.productLoading} /> : null}
        {productOptions.length > 0 ? (
          <View style={styles.productResults}>
            {productOptions.map((product) => (
              <Button
                key={product.id}
                mode={selectedProduct?.id === product.id ? 'contained-tonal' : 'text'}
                contentStyle={styles.productResultButton}
                onPress={() => {
                  setSelectedProduct(product);
                  setProductSearch(product.name);
                  setProductOptions([]);
                  setReport(null);
                }}
              >
                {productDisplayLabel(product)}
              </Button>
            ))}
          </View>
        ) : null}
        <View style={styles.dateRow}>
          <TextInput mode="outlined" label="Start" value={startDate} onChangeText={setStartDate} style={styles.dateInput} />
          <TextInput mode="outlined" label="End" value={endDate} onChangeText={setEndDate} style={styles.dateInput} />
        </View>
        <Button mode="contained" loading={loading} onPress={() => void load()}>Submit</Button>
      </View>

      {report ? (
        <>
          <View style={styles.summaryList}>
            <SummaryRow label="Total Sales Amount" value={number(summary?.total_sales_amount)} />
            <SummaryRow label="Total Return Amount" value={number(summary?.total_return_amount)} />
            <SummaryRow label="Total Sales Qty" value={number(summary?.total_sales_qty)} />
            <SummaryRow label="Total Return Qty" value={number(summary?.total_return_qty)} />
            <SummaryRow label="Profitable Qty" value={number(summary?.profitable_qty)} />
            <SummaryRow label="Profitable Amount" value={number(summary?.profitable_amount)} />
          </View>

          <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
            {rows.map((row) => (
              <View key={`${row.type}-${row.sl}`} style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <Text variant="titleSmall" style={styles.rowTitle}>{row.product_name}</Text>
                  <Text variant="titleSmall">{number(row.amount)}</Text>
                </View>
                <Text variant="bodySmall" style={styles.muted}>{row.sl}. {row.date} · {row.type}</Text>
                <Text variant="bodyMedium">{row.customer_name}</Text>
                <View style={styles.metrics}>
                  <Metric label="Unit" value={row.unit || '-'} />
                  <Metric label="Unit Price" value={number(row.unit_price)} />
                  <Metric label="Qty" value={number(row.qty)} />
                </View>
              </View>
            ))}
            {!loading && rows.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="titleMedium">No product rows</Text>
                <Text variant="bodyMedium" style={styles.muted}>No product rows found in this date range.</Text>
              </View>
            ) : null}
            <View style={styles.words}>
              <Text variant="bodyMedium">Sales In Words: {summary?.sales_in_words ?? ''}</Text>
              <Text variant="bodyMedium">Returns In Words: {summary?.returns_in_words ?? ''}</Text>
            </View>
          </ScrollView>
        </>
      ) : (
        <View style={styles.empty}>
          <Text variant="titleMedium">No report loaded</Text>
          <Text variant="bodyMedium" style={styles.muted}>Select a product and submit to view this report.</Text>
        </View>
      )}
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="bodyMedium" style={styles.muted}>{label}</Text>
      <Text variant="titleMedium">{value}</Text>
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

function number(value?: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value ?? 0);
}

function productDisplayLabel(product: ProductOption) {
  return product.code ? `${product.name} · ${product.code}` : product.name;
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
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  muted: {
    color: '#6b7280',
  },
  filters: {
    gap: 10,
  },
  productLoading: {
    alignSelf: 'flex-start',
    marginLeft: 12,
  },
  productResults: {
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  productResultButton: {
    justifyContent: 'flex-start',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInput: {
    flex: 1,
  },
  summaryList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  summaryRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rows: {
    flex: 1,
  },
  rowsContent: {
    gap: 12,
    paddingBottom: 24,
  },
  rowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 14,
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitle: {
    flex: 1,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    padding: 24,
    gap: 4,
  },
  words: {
    gap: 8,
    paddingVertical: 8,
  },
});
