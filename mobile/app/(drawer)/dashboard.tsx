import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen } from '@/src/components/Screen';
import { Muted, Stat, Title } from '@/src/components/UI';
import { api } from '@/src/lib/api';
import type { DashboardSummary } from '@/src/types';

type RouteParams = {
  refreshKey?: number;
};

export default function DashboardScreen() {
  const route = useRoute();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const response = await api.dashboard();
    setSummary(response.data as DashboardSummary);
  }, []);

  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

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

    </Screen>
  );
}
