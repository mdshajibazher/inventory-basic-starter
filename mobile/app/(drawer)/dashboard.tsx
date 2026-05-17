import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';
import { Card, Muted, Stat, Title } from '@/src/components/UI';
import { api } from '@/src/lib/api';
import type { DashboardSummary } from '@/src/types';

export default function DashboardScreen() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const response = await api.dashboard();
    setSummary(response.data as DashboardSummary);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator size="large" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Dashboard</Title>
      <Muted>Overview of the current inventory.</Muted>

      <View style={{ gap: 12 }}>
        <Stat label="Products" value={summary?.total_products ?? 0} />
        <Stat label="Categories" value={summary?.total_categories ?? 0} />
        <Stat label="Total Quantity" value={summary?.total_quantity ?? 0} />
        <Stat label="Low Stock Products" value={summary?.low_stock_products ?? 0} />
      </View>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Recent movements</Text>
        {(summary?.recent_movements ?? []).length === 0 ? (
          <Muted>No stock movement yet.</Muted>
        ) : (
          summary?.recent_movements.map((movement) => (
            <View key={movement.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef0f4' }}>
              <Text style={{ fontWeight: '700' }}>
                {movement.type.toUpperCase()} — {movement.product?.name}
              </Text>
              <Muted>
                Qty {movement.quantity}: {movement.before_quantity} → {movement.after_quantity}
              </Muted>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
