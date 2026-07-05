import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { ActivityLogTimeline } from '@/src/components/ActivityLogTimeline';
import { api } from '@/src/lib/api';
import type { Payment } from '@/src/types';

const paymentTypeLabels: Record<string, string> = {
  sale_payment: 'Sale payment',
  customer_advance: 'Customer advance',
  purchase_payment: 'Purchase payment',
  supplier_advance: 'Supplier advance',
  sale_return_refund: 'Sale return refund',
  purchase_return_refund: 'Purchase return refund',
};

export default function PaymentsDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const paymentId = Number(id);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPayment = useCallback(async () => {
    if (!paymentId) return;

    setLoading(true);
    try {
      const response = await api.payment(paymentId);
      setPayment(response.data);
    } catch (error) {
      Alert.alert('Unable to load payment', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void loadPayment();
  }, [loadPayment]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headlineSmall">Payment Details</Text>
          <Text variant="bodyMedium" style={styles.muted}>{payment?.payment_reference ?? 'Loading payment record'}</Text>
        </View>
        <Button mode="outlined" onPress={() => router.push('/(drawer)/payments')}>Back</Button>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} /> : null}

      {payment ? (
        <>
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Summary label="Reference" value={payment.payment_reference} />
              <Summary label="Type" value={paymentTypeLabels[payment.payment_type] ?? payment.payment_type} />
              <Summary label="Party" value={payment.customer?.name ?? payment.supplier?.name ?? '-'} />
              <Summary label="Account" value={payment.account?.name ?? '-'} />
              <Summary label="Document" value={documentLabel(payment)} />
              <Summary label="Method" value={payment.paying_method} />
              <Summary label="Approval" value={payment.approval_status === 'pending' ? 'Pending approval' : 'Approved'} />
              <Summary label="Amount" value={`${payment.direction === 'in' ? '+' : '-'}${money(payment.amount)}`} strong />
              {payment.payment_note ? <Text variant="bodyMedium" style={styles.note}>{payment.payment_note}</Text> : null}
            </Card.Content>
          </Card>
          <ActivityLogTimeline logs={payment.activity_logs ?? []} />
        </>
      ) : null}
    </ScrollView>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View>
      <Text variant="labelSmall" style={styles.label}>{label}</Text>
      <Text variant={strong ? 'titleMedium' : 'bodyMedium'}>{value}</Text>
    </View>
  );
}

function documentLabel(payment: Payment): string {
  return payment.reference_document?.reference_no || payment.sale?.reference_no || payment.purchase?.reference_no || payment.sale_return?.reference_no || payment.purchase_return?.reference_no || paymentTypeLabels[payment.payment_type] || '-';
}

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { gap: 12, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  muted: { color: '#666666' },
  loading: { marginVertical: 12 },
  card: { backgroundColor: '#ffffff' },
  cardContent: { gap: 10 },
  label: { color: '#6b7280', textTransform: 'uppercase' },
  note: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10, color: '#4b5563' },
});
