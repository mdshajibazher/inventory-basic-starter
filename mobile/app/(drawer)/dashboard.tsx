import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRoute } from 'expo-router/react-navigation';
import { DashboardScreenContainer } from '@/src/components/DashboardScreenContainer';
import { DashboardApprovalSection } from '@/src/components/DashboardApprovalSection';
import { Button, Muted, Stat, Title } from '@/src/components/UI';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/lib/api';
import { approvalSections, canViewApprovalSection } from '@/src/lib/dashboard-approvals';
import type { DashboardSummary } from '@/src/types';

type RouteParams = {
  refreshKey?: number;
};

export default function DashboardScreen() {
  const { user } = useAuth();
  const scopeKey = `${user?.id ?? ''}:${user?.current_biller_id ?? ''}:${[...(user?.permissions ?? [])].sort().join(',')}`;
  return <DashboardContent key={scopeKey} />;
}

function DashboardContent() {
  const route = useRoute();
  const { user, refreshUser } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [approvalRefreshKey, setApprovalRefreshKey] = useState(0);
  const summaryRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++summaryRequest.current;
    setLoading(true);
    setSummaryError(null);
    try {
      const response = await api.dashboard();
      if (request === summaryRequest.current) setSummary(response.data as DashboardSummary);
    } catch (cause) {
      if (request === summaryRequest.current) {
        setSummaryError(cause instanceof Error ? cause.message : 'Unable to load the dashboard overview.');
      }
    } finally {
      if (request === summaryRequest.current) setLoading(false);
    }
  }, []);

  const refreshKey = (route.params as RouteParams | undefined)?.refreshKey;

  useEffect(() => () => { summaryRequest.current += 1; }, []);

  const refreshAll = useCallback(() => {
    setApprovalRefreshKey(key => key + 1);
    return load();
  }, [load]);

  useFocusEffect(useCallback(() => {
    void refreshAll();
  }, [refreshAll, refreshKey]));

  async function refresh() {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }

  async function approvalSettled(permissionsMayHaveChanged: boolean) {
    if (permissionsMayHaveChanged) {
      try {
        await refreshUser();
      } catch {
        // Keep the dashboard retryable when the permission refresh is unavailable.
      }
    }
    await refreshAll();
  }

  const permissions = user?.permissions ?? [];

  return (
    <DashboardScreenContainer refreshing={refreshing} onRefresh={() => { void refresh(); }}>
      <Title>Dashboard</Title>
      <Muted>Overview of the current inventory.</Muted>

      {loading ? <ActivityIndicator accessibilityLabel="Loading dashboard overview" /> : null}
      {summaryError ? (
        <View accessibilityRole="alert" style={{ gap: 10 }}>
          <Muted>{summaryError}</Muted>
          <Button title="Retry overview" disabled={loading} onPress={() => { void load(); }} />
        </View>
      ) : null}

      {summary ? <View style={{ gap: 12 }}>
        <Stat label="Products" value={summary?.total_products ?? 0} />
        <Stat label="Categories" value={summary?.total_categories ?? 0} />
        <Stat label="Total Quantity" value={summary?.total_quantity ?? 0} />
        <Stat label="Low Stock Products" value={summary?.low_stock_products ?? 0} />
      </View> : null}

      {approvalSections.filter(section => canViewApprovalSection(permissions, section)).map(section => (
        <DashboardApprovalSection
          key={section.type}
          section={section}
          permissions={permissions}
          refreshKey={approvalRefreshKey}
          onSettled={permissionsMayHaveChanged => { void approvalSettled(permissionsMayHaveChanged); }}
        />
      ))}
    </DashboardScreenContainer>
  );
}
