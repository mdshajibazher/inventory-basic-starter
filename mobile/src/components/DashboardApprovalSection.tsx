import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Text } from 'react-native-paper';
import { useDashboardApprovals } from '@/src/hooks/use-dashboard-approvals';
import { approvalSections, type ApprovalRow, type ApprovalType } from '@/src/lib/dashboard-approvals';

type Section = (typeof approvalSections)[number];

const detailRoutes = {
  sales: '/(drawer)/sales-invoices-detail',
  returns: '/(drawer)/return-invoices-detail',
  purchases: '/(drawer)/purchase-invoices-detail',
  purchase_returns: '/(drawer)/purchase-return-invoices-detail',
  payments: '/(drawer)/payments-detail',
} as const satisfies Record<ApprovalType, string>;

const paymentTypes: Record<string, string> = {
  sale_payment: 'Sale payment',
  customer_advance: 'Customer advance',
  purchase_payment: 'Purchase payment',
  supplier_advance: 'Supplier advance',
  sale_return_refund: 'Sale return refund',
  purchase_return_refund: 'Purchase return refund',
};

function money(value: string | number) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DashboardApprovalSection({ section, permissions, refreshKey, onSettled }: {
  section: Section;
  permissions: string[];
  refreshKey: number;
  onSettled: (permissionsMayHaveChanged: boolean) => void;
}) {
  const { rows, meta, page, setPage, loading, error, reload, approvingId, approve } = useDashboardApprovals(section.type, refreshKey);
  const canApprove = permissions.includes(section.approvalPermission);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function confirmApproval(row: ApprovalRow) {
    Alert.alert(
      'Approve pending record?',
      `Reference: ${row.reference}\nAmount: ${money(row.amount)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            if (!mounted.current) return;
            void (async () => {
              let permissionsMayHaveChanged = false;
              try {
                await approve(row);
              } catch (cause) {
                permissionsMayHaveChanged = cause instanceof Error && 'status' in cause && cause.status === 403;
                if (mounted.current) Alert.alert('Approval failed', cause instanceof Error ? cause.message : 'Unable to approve this record. Please try again.');
              } finally {
                if (mounted.current) onSettled(permissionsMayHaveChanged);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Card mode="outlined" style={styles.section}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.flex}>{section.title}</Text>
          <Text variant="labelMedium" style={styles.count}>{meta ? `${meta.total} pending` : 'Pending'}</Text>
        </View>
        <Text variant="bodySmall" style={styles.muted}>Newest first · 10 per page</Text>

        {loading ? <ActivityIndicator accessibilityLabel={`Loading ${section.title}`} style={styles.loading} /> : null}
        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text variant="bodyMedium">{error}</Text>
            <Button mode="outlined" disabled={loading} onPress={() => { void reload(); }}>Retry</Button>
          </View>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>No pending approvals.</Text>
        ) : null}

        {!error && rows.map(row => (
          <View key={row.id} style={styles.row}>
            <View style={styles.header}>
              <Text variant="titleSmall" style={styles.flex}>{row.reference}</Text>
              <Text variant="titleSmall">{money(row.amount)}</Text>
            </View>
            <Text variant="bodyMedium">{row.party || '—'}</Text>
            <Text variant="bodySmall" style={styles.muted}>Date: {row.date || '—'}</Text>
            {section.type === 'payments' ? (
              <View style={styles.metadata}>
                <Text variant="bodySmall">Type: {paymentTypes[row.paymentType ?? ''] ?? row.paymentType ?? '—'}</Text>
                <Text variant="bodySmall">Direction: {row.direction === 'in' ? 'Incoming' : row.direction === 'out' ? 'Outgoing' : row.direction || '—'}</Text>
                <Text variant="bodySmall">Account: {row.account || '—'}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button mode="outlined" accessibilityLabel={`View ${row.reference}`} onPress={() => router.push({ pathname: detailRoutes[section.type], params: { id: String(row.id) } })}>View</Button>
              {canApprove && row.canApprove ? (
                <Button
                  mode="contained"
                  accessibilityLabel={`Approve ${row.reference}`}
                  loading={approvingId === row.id}
                  disabled={loading || approvingId !== null}
                  onPress={() => confirmApproval(row)}
                >{approvingId === row.id ? 'Approving…' : 'Approve'}</Button>
              ) : null}
            </View>
          </View>
        ))}

        {meta && meta.total > 0 ? (
          <View style={styles.pagination}>
            <Button disabled={loading || approvingId !== null || page <= 1} onPress={() => setPage(page - 1)}>Previous</Button>
            <Text variant="bodySmall">Page {page} of {meta.last_page}</Text>
            <Button disabled={loading || approvingId !== null || page >= meta.last_page} onPress={() => setPage(page + 1)}>Next</Button>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#ffffff' },
  content: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  count: { backgroundColor: '#f2f2f2', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  muted: { color: '#666666' },
  loading: { paddingVertical: 14 },
  error: { gap: 10, paddingVertical: 8 },
  empty: { color: '#666666', paddingVertical: 16 },
  row: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 14, gap: 6 },
  metadata: { gap: 3 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingVertical: 4 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
});
