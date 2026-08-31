import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Button, Card, DataTable, Text } from 'react-native-paper';
import { ActivityLogTimeline } from '@/src/components/ActivityLogTimeline';
import { api } from '@/src/lib/api';
import type { Product } from '@/src/types';
import { productTaxMethodLabel } from '@/src/product-list-display';

export default function ProductsDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const productId = Number(id);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProduct = useCallback(async () => {
    if (!productId) return;

    setLoading(true);
    try {
      const response = await api.product(productId);
      setProduct(response.data as Product);
    } catch (error) {
      Alert.alert('Unable to load product', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headlineSmall">Product Details</Text>
          <Text variant="bodyMedium" style={styles.muted}>{product ? `${product.name} · ${product.code}` : 'Loading product record'}</Text>
        </View>
        <View style={styles.headerActions}>
          {product ? (
            <Button mode="contained" onPress={() => router.push({ pathname: '/(drawer)/products-edit', params: { id: String(product.id) } })}>Edit</Button>
          ) : null}
          <Button mode="outlined" onPress={() => router.push('/(drawer)/products')}>Back</Button>
        </View>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} /> : null}

      {product ? (
        <>
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <ProductImage uri={product.image_url ?? product.image} />
              <Text variant="titleLarge">{product.name}</Text>
              <Text variant="bodyMedium" style={styles.muted}>{product.type} · {product.barcode_symbology}</Text>
              <View style={styles.summaryGrid}>
                <Summary label="Code" value={product.code} />
                <Summary label="Brand" value={product.brand?.title ?? '-'} />
                <Summary label="Category" value={product.category?.name ?? '-'} />
                <Summary label="Status" value={product.is_active ? 'Active' : 'Inactive'} />
                <Summary label="Current Stock" value={quantity(product.qty ?? product.quantity)} strong />
                <Summary label="Cost" value={money(product.cost)} />
                <Summary label="Base Unit Price" value={money(product.price)} strong />
                <Summary label="Alert Quantity" value={product.alert_quantity == null ? '-' : quantity(product.alert_quantity)} />
                <Summary label="Tax" value={product.tax ? `${product.tax.name} (${product.tax.rate}%)` : '-'} />
                <Summary label="Tax Method" value={productTaxMethodLabel(product.tax_method)} />
                <Summary label="Base Unit" value={product.unit?.unit_name ?? '-'} />
                <Summary label="Sale Unit" value={product.sale_unit?.unit_name ?? '-'} />
                <Summary label="Purchase Unit" value={product.purchase_unit?.unit_name ?? '-'} />
              </View>
              {product.product_details ? <Text variant="bodyMedium" style={styles.note}>{product.product_details}</Text> : null}
            </Card.Content>
          </Card>

          {product.promotion ? (
            <Card mode="outlined" style={styles.card}>
              <Card.Content style={styles.cardContent}>
                <Text variant="titleMedium">Promotion</Text>
                <Summary label="Promotion Price" value={money(product.promotion_price)} strong />
                <Summary label="Starts" value={product.starting_date ?? '-'} />
                <Summary label="Ends" value={product.last_date ?? '-'} />
              </Card.Content>
            </Card>
          ) : null}

          <DetailTable title="Variants" empty="No variants configured." headers={['Name', 'Code', 'Price', 'Qty']}>
            {(product.variants ?? []).map((variant) => (
              <DataTable.Row key={variant.id}>
                <DataTable.Cell style={styles.nameColumn}>{variant.name}</DataTable.Cell>
                <DataTable.Cell style={styles.nameColumn}>{variant.item_code}</DataTable.Cell>
                <DataTable.Cell numeric style={styles.numberColumn}>{money(variant.additional_price)}</DataTable.Cell>
                <DataTable.Cell numeric style={styles.numberColumn}>{quantity(variant.qty)}</DataTable.Cell>
              </DataTable.Row>
            ))}
          </DetailTable>

          <DetailTable title="Warehouse Stock" empty="No warehouse stock recorded." headers={['Warehouse', 'Batch', 'Qty', 'Price']}>
            {(product.warehouse_prices ?? []).map((warehousePrice, index) => (
              <DataTable.Row key={`${warehousePrice.warehouse_id}-${warehousePrice.variant_id ?? 'base'}-${warehousePrice.product_batch_id ?? index}`}>
                <DataTable.Cell style={styles.nameColumn}>{warehousePrice.warehouse_name ?? `Warehouse ${warehousePrice.warehouse_id}`}</DataTable.Cell>
                <DataTable.Cell style={styles.nameColumn}>{warehousePrice.batch_no ?? '-'}</DataTable.Cell>
                <DataTable.Cell numeric style={styles.numberColumn}>{quantity(warehousePrice.qty)}</DataTable.Cell>
                <DataTable.Cell numeric style={styles.numberColumn}>{warehousePrice.price == null ? '-' : money(warehousePrice.price)}</DataTable.Cell>
              </DataTable.Row>
            ))}
          </DetailTable>

          <ActivityLogTimeline logs={product.activity_logs ?? []} />
        </>
      ) : null}
    </ScrollView>
  );
}

function ProductImage({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={styles.imageFallback}>
        <MaterialCommunityIcons name="package-variant-closed" size={42} color="#9ca3af" />
        <Text variant="bodySmall" style={styles.muted}>Product image</Text>
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.image} onError={() => setFailed(true)} />;
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryItem}>
      <Text variant="labelSmall" style={styles.label}>{label}</Text>
      <Text variant={strong ? 'titleMedium' : 'bodyMedium'}>{value}</Text>
    </View>
  );
}

function DetailTable({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <Text variant="titleMedium">{title}</Text>
        {rows ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <DataTable style={styles.table}>
              <DataTable.Header>
                {headers.map((header) => <DataTable.Title key={header} style={header === 'Name' || header === 'Warehouse' || header === 'Batch' || header === 'Code' ? styles.nameColumn : styles.numberColumn} numeric={header === 'Price' || header === 'Qty'}>{header}</DataTable.Title>)}
              </DataTable.Header>
              {children}
            </DataTable>
          </ScrollView>
        ) : (
          <Text variant="bodySmall" style={styles.empty}>{empty}</Text>
        )}
      </Card.Content>
    </Card>
  );
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quantity(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { gap: 12, padding: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  muted: { color: '#666666' },
  loading: { marginVertical: 12 },
  card: { backgroundColor: '#ffffff' },
  cardContent: { gap: 12 },
  image: { width: 140, height: 140, borderRadius: 8, backgroundColor: '#f2f2f2' },
  imageFallback: { alignItems: 'center', justifyContent: 'center', width: 140, height: 140, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb', gap: 4 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryItem: { minWidth: 130, flexGrow: 1, flexBasis: '45%' },
  label: { color: '#6b7280', textTransform: 'uppercase' },
  note: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10, color: '#4b5563' },
  table: { minWidth: 620, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 },
  nameColumn: { flex: 1.25 },
  numberColumn: { flex: 0.8 },
  empty: { backgroundColor: '#f9fafb', color: '#6b7280', padding: 10, borderRadius: 6 },
});
